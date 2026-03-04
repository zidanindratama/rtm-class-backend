import {
  AIJobStatus,
  AIJobType,
  MaterialStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiCallbackInput, EnqueueAiTransformInput } from './ai-jobs.schemas';

type OAuthCache = {
  token: string;
  expiresAtEpochSec: number;
};

const WORKER_INTERVAL_MS = 5000;
const OAUTH_CACHE_KEY = 'rtm:ai:oauth_token';

@Injectable()
export class AiJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiJobsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.processNextAcceptedJob();
    }, WORKER_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.redis) {
      void this.redis.quit();
    }
  }

  async enqueue(user: JwtPayload, input: EnqueueAiTransformInput) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only admin or teacher can generate AI outputs');
    }

    const material = await this.prisma.material.findUnique({
      where: { id: input.materialId },
      select: { id: true, classroomId: true },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.classesService.assertClassAccess(user, material.classroomId);

    const uniqueOutputs = [...new Set(input.outputs)];
    const jobs = await this.prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        uniqueOutputs.map((type) =>
          tx.aiJob.create({
            data: {
              materialId: material.id,
              requestedById: user.sub,
              type,
              status: AIJobStatus.accepted,
              parameters: input.options ?? {},
            },
          }),
        ),
      );

      await tx.material.update({
        where: { id: material.id },
        data: { status: MaterialStatus.PROCESSING },
      });

      return created;
    });

    return {
      message: 'AI transform jobs queued',
      data: {
        materialId: material.id,
        jobs,
      },
    };
  }

  async getJobById(user: JwtPayload, id: string) {
    const job = await this.prisma.aiJob.findUnique({
      where: { id },
      include: {
        material: {
          select: {
            id: true,
            classroomId: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('AI job not found');
    }

    await this.classesService.assertClassAccess(user, job.material.classroomId);

    return {
      message: 'AI job fetched',
      data: job,
    };
  }

  async handleCallback(jobId: string, payload: AiCallbackInput) {
    const job = await this.prisma.aiJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, materialId: true, type: true },
    });

    if (!job) {
      throw new NotFoundException('AI job not found');
    }

    if (this.isTerminalStatus(job.status)) {
      await this.forwardCallbackMirror(jobId, payload);
      return {
        message: 'AI callback acknowledged (idempotent)',
        data: { jobId: job.id, status: job.status },
      };
    }

    if (payload.status === AIJobStatus.succeeded || (payload.success && !payload.status)) {
      await this.prisma.$transaction([
        this.prisma.aiJob.update({
          where: { id: job.id },
          data: {
            status: AIJobStatus.succeeded,
            completedAt: new Date(),
            externalJobId: payload.externalJobId,
          },
        }),
        this.prisma.aiOutput.upsert({
          where: { jobId: job.id },
          create: {
            jobId: job.id,
            materialId: job.materialId,
            type: job.type,
            content: this.toInputJsonValue(payload.result),
          },
          update: {
            content: this.toInputJsonValue(payload.result),
          },
        }),
      ]);

      await this.refreshMaterialStatus(job.materialId);
      await this.forwardCallbackMirror(job.id, payload);

      return {
        message: 'AI callback processed',
        data: { jobId: job.id, status: AIJobStatus.succeeded },
      };
    }

    if (
      payload.status === AIJobStatus.failed_delivery ||
      payload.status === AIJobStatus.failed_processing ||
      payload.success === false
    ) {
      const failedStatus =
        payload.status === AIJobStatus.failed_delivery
          ? AIJobStatus.failed_delivery
          : AIJobStatus.failed_processing;

      await this.prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: failedStatus,
          completedAt: new Date(),
          lastError: this.buildCallbackFailureMessage(payload),
          externalJobId: payload.externalJobId,
        },
      });

      await this.refreshMaterialStatus(job.materialId);
      await this.forwardCallbackMirror(job.id, payload);

      return {
        message: 'AI callback processed (failed)',
        data: { jobId: job.id, status: failedStatus },
      };
    }

    await this.prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: AIJobStatus.processing,
        externalJobId: payload.externalJobId,
      },
    });

    await this.refreshMaterialStatus(job.materialId);
    await this.forwardCallbackMirror(job.id, payload);

    return {
      message: 'AI callback processed (processing)',
      data: { jobId: job.id, status: AIJobStatus.processing },
    };
  }

  private async processNextAcceptedJob() {
    if (this.running) return;

    this.running = true;
    try {
      const acceptedJob = await this.prisma.aiJob.findFirst({
        where: { status: AIJobStatus.accepted },
        orderBy: { createdAt: 'asc' },
        include: {
          material: {
            select: {
              id: true,
              fileUrl: true,
              fileMimeType: true,
            },
          },
        },
      });

      if (!acceptedJob) return;

      const job = await this.prisma.aiJob.update({
        where: { id: acceptedJob.id },
        data: {
          status: AIJobStatus.processing,
          startedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
        include: {
          material: {
            select: {
              id: true,
              fileUrl: true,
              fileMimeType: true,
            },
          },
        },
      });

      await this.dispatchToAiService(job);
      await this.refreshMaterialStatus(job.materialId);
    } catch (error) {
      this.logger.error(
        'AI queue worker failed while processing accepted job',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchToAiService(job: {
    id: string;
    type: AIJobType;
    parameters: unknown;
    materialId: string;
    material: { fileUrl: string; fileMimeType: string | null };
  }) {
    try {
      const endpointPath = this.endpointPathFromJobType(job.type);
      const accessToken = await this.getOAuthAccessToken();
      const baseUrl = this.requireEnv('AI_BASE_URL');
      const callbackBase = this.requireEnv('AI_CALLBACK_BASE_URL');

      const materialFileResponse = await fetch(job.material.fileUrl);
      if (!materialFileResponse.ok) {
        throw new Error(`Failed to download material file (${materialFileResponse.status})`);
      }
      const arrayBuffer = await materialFileResponse.arrayBuffer();
      const blob = new Blob([arrayBuffer]);

      const parameters = (job.parameters ?? {}) as Record<string, unknown>;
      const form = new FormData();
      const callbackSecret = process.env.AI_CALLBACK_SECRET?.trim();
      const callbackUrl = callbackSecret
        ? `${callbackBase}/api/v1/ai/jobs/${job.id}/callback?callback_secret=${encodeURIComponent(callbackSecret)}`
        : `${callbackBase}/api/v1/ai/jobs/${job.id}/callback`;
      const uploadFilename = this.buildMaterialFilename(
        job.materialId,
        job.material.fileUrl,
        job.material.fileMimeType,
      );
      form.set('user_id', `material:${job.materialId}`);
      form.set('callback_url', callbackUrl);
      form.set('file', blob, uploadFilename);

      this.applyParametersByType(form, job.type, parameters);

      const response = await fetch(`${baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      let responsePayload: unknown = null;
      try {
        responsePayload = await response.json();
      } catch {
        responsePayload = null;
      }

      if (!response.ok) {
        const errorText =
          typeof responsePayload === 'object' && responsePayload !== null
            ? JSON.stringify(responsePayload)
            : `HTTP ${response.status}`;
        throw new Error(`AI request failed: ${errorText}`);
      }

      const normalized = this.normalizeAiResponse(responsePayload);
      if (response.status === 202) {
        await this.prisma.aiJob.update({
          where: { id: job.id },
          data: {
            status: AIJobStatus.processing,
            externalJobId: normalized.externalJobId,
          },
        });
        return;
      }

      await this.prisma.$transaction([
        this.prisma.aiJob.update({
          where: { id: job.id },
          data: {
            status: AIJobStatus.succeeded,
            completedAt: new Date(),
            externalJobId: normalized.externalJobId,
          },
        }),
        this.prisma.aiOutput.upsert({
          where: { jobId: job.id },
          create: {
            jobId: job.id,
            materialId: job.materialId,
            type: job.type,
            content: this.toInputJsonValue(normalized.result),
          },
          update: {
            content: this.toInputJsonValue(normalized.result),
          },
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI dispatch error';
      await this.prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: AIJobStatus.failed_processing,
          completedAt: new Date(),
          lastError: message,
        },
      });
      await this.refreshMaterialStatus(job.materialId);
    }
  }

  private applyParametersByType(
    form: FormData,
    type: AIJobType,
    parameters: Record<string, unknown>,
  ) {
    const mcpEnabled = this.boolFromInput(parameters.mcpEnabled, true);
    const mcqEnabled = this.boolFromInput(parameters.mcqEnabled, true);

    if (type === AIJobType.MCQ) {
      form.set('mcq_count', String(this.numberFromInput(parameters.mcqCount, 10)));
      form.set('mcp_enabled', String(mcpEnabled));
      return;
    }

    if (type === AIJobType.ESSAY) {
      form.set('essay_count', String(this.numberFromInput(parameters.essayCount, 5)));
      form.set('mcp_enabled', String(mcpEnabled));
      return;
    }

    if (type === AIJobType.SUMMARY) {
      form.set(
        'summary_max_words',
        String(this.numberFromInput(parameters.summaryMaxWords, 200)),
      );
      form.set('mcp_enabled', String(mcqEnabled));
    }
  }

  private buildMaterialFilename(
    materialId: string,
    fileUrl: string,
    fileMimeType: string | null,
  ): string {
    const extFromUrl = this.extractSupportedExtensionFromUrl(fileUrl);
    if (extFromUrl) {
      return `material-${materialId}${extFromUrl}`;
    }

    const extFromMime = this.extensionFromMimeType(fileMimeType);
    if (extFromMime) {
      return `material-${materialId}${extFromMime}`;
    }

    throw new Error(
      'Unsupported material file extension. Supported: .pdf, .pptx, .txt',
    );
  }

  private extractSupportedExtensionFromUrl(url: string): '.pdf' | '.pptx' | '.txt' | null {
    const lower = url.toLowerCase();
    const pathname = (() => {
      try {
        return new URL(lower).pathname;
      } catch {
        return lower;
      }
    })();

    if (pathname.endsWith('.pdf')) return '.pdf';
    if (pathname.endsWith('.pptx')) return '.pptx';
    if (pathname.endsWith('.txt')) return '.txt';
    return null;
  }

  private extensionFromMimeType(mimeType: string | null): '.pdf' | '.pptx' | '.txt' | null {
    const normalized = mimeType?.trim().toLowerCase();
    if (!normalized) return null;

    if (normalized.includes('application/pdf')) return '.pdf';
    if (normalized.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation')) {
      return '.pptx';
    }
    if (normalized.startsWith('text/plain')) return '.txt';
    return null;
  }

  private endpointPathFromJobType(type: AIJobType): string {
    const map: Record<AIJobType, string | undefined> = {
      [AIJobType.MCQ]: process.env.AI_ENDPOINT_MCQ ?? '/api/mcq',
      [AIJobType.ESSAY]: process.env.AI_ENDPOINT_ESSAY ?? '/api/essay',
      [AIJobType.SUMMARY]: process.env.AI_ENDPOINT_SUMMARY ?? '/api/summary',
      [AIJobType.LKPD]: process.env.AI_ENDPOINT_LKPD,
      [AIJobType.REMEDIAL]: process.env.AI_ENDPOINT_REMEDIAL,
      [AIJobType.DISCUSSION_TOPIC]: process.env.AI_ENDPOINT_DISCUSSION_TOPIC,
    };

    const path = map[type];
    if (!path) {
      throw new Error(`AI endpoint for ${type} is not configured`);
    }
    return path;
  }

  private async getOAuthAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const redis = this.getRedis();
    if (redis) {
      const cachedToken = await redis.get(OAUTH_CACHE_KEY);
      if (cachedToken) return cachedToken;
    }

    const baseUrl = this.requireEnv('AI_BASE_URL');
    const clientId = this.getEnvAny(['AI_CLIENT_ID', 'OAUTH_CLIENT_ID']);
    const clientSecret = this.getEnvAny(['AI_CLIENT_SECRET', 'OAUTH_CLIENT_SECRET']);
    const scope = process.env.AI_SCOPE ?? 'material:write lkpd:write lkpd:read';
    const tokenEndpoint = process.env.AI_OAUTH_TOKEN_ENDPOINT ?? '/api/oauth/token';

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('scope', scope);

    const response = await fetch(`${baseUrl}${tokenEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch {
        errorText = '';
      }
      throw new UnauthorizedException(
        `Failed to obtain AI OAuth access token (${response.status})${errorText ? `: ${errorText}` : ''}`,
      );
    }

    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      data?: { access_token?: string; expires_in?: number };
    };
    const token = json.access_token ?? json.data?.access_token;
    const expiresIn = json.expires_in ?? json.data?.expires_in ?? 300;
    if (!token) {
      throw new UnauthorizedException('AI OAuth response does not contain access_token');
    }

    const ttl = Math.max(30, expiresIn - 30);
    if (redis) {
      await redis.set(OAUTH_CACHE_KEY, token, 'EX', ttl);
    }

    const cache: OAuthCache = { token, expiresAtEpochSec: now + ttl };
    this.logger.debug(`AI OAuth token refreshed. expires_at=${cache.expiresAtEpochSec}`);
    return cache.token;
  }

  private getRedis(): Redis | null {
    if (this.redis) return this.redis;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (error) => {
      this.logger.warn(`Redis unavailable for AI token cache: ${error.message}`);
    });

    void this.redis.connect().catch(() => null);
    return this.redis;
  }

  private async refreshMaterialStatus(materialId: string): Promise<void> {
    const jobs = await this.prisma.aiJob.findMany({
      where: { materialId },
      select: { status: true },
    });

    let status: MaterialStatus = MaterialStatus.UPLOADED;
    if (
      jobs.some(
        (job) => job.status === AIJobStatus.accepted || job.status === AIJobStatus.processing,
      )
    ) {
      status = MaterialStatus.PROCESSING;
    } else if (jobs.some((job) => job.status === AIJobStatus.succeeded)) {
      status = MaterialStatus.READY;
    }

    await this.prisma.material.update({
      where: { id: materialId },
      data: { status },
    });
  }

  private normalizeAiResponse(payload: unknown): {
    externalJobId?: string;
    result: unknown;
  } {
    if (typeof payload !== 'object' || payload === null) {
      return { result: payload };
    }

    const obj = payload as Record<string, unknown>;
    const externalJobId =
      typeof obj.job_id === 'string'
        ? obj.job_id
        : typeof obj.jobId === 'string'
          ? obj.jobId
          : typeof obj.id === 'string'
            ? obj.id
            : undefined;

    const result =
      obj.data !== undefined
        ? obj.data
        : obj.result !== undefined
          ? obj.result
          : obj;

    return { externalJobId, result };
  }

  private requireEnv(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }

  private getEnvAny(keys: string[]): string {
    for (const key of keys) {
      const value = process.env[key]?.trim();
      if (value) return value;
    }
    throw new Error(`Missing required env vars: ${keys.join(' or ')}`);
  }

  private numberFromInput(input: unknown, fallback: number): number {
    const value = Number(input);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
    return fallback;
  }

  private boolFromInput(input: unknown, fallback: boolean): boolean {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) return {};
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value as Prisma.InputJsonValue;
    if (typeof value === 'object') return value as Prisma.InputJsonValue;
    return String(value);
  }

  private async forwardCallbackMirror(
    jobId: string,
    payload: AiCallbackInput,
  ): Promise<void> {
    const mirrorUrl = process.env.AI_CALLBACK_FORWARD_URL?.trim();
    if (!mirrorUrl) return;

    try {
      await fetch(mirrorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-source': 'rtm-class-backend',
        },
        body: JSON.stringify({
          jobId,
          forwardedAt: new Date().toISOString(),
          payload,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to mirror callback to ${mirrorUrl}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private isTerminalStatus(status: AIJobStatus): boolean {
    return (
      status === AIJobStatus.succeeded ||
      status === AIJobStatus.failed_processing ||
      status === AIJobStatus.failed_delivery
    );
  }

  private buildCallbackFailureMessage(payload: AiCallbackInput): string {
    if (payload.error?.message?.trim()) {
      const code = payload.error.code?.trim();
      return code
        ? `AI callback failure [${code}]: ${payload.error.message.trim()}`
        : `AI callback failure: ${payload.error.message.trim()}`;
    }

    if (payload.errorMessage?.trim()) return payload.errorMessage.trim();

    const result = payload.result;
    if (result && typeof result === 'object') {
      try {
        const serialized = JSON.stringify(result);
        if (serialized.length > 1000) {
          return `AI callback failure details: ${serialized.slice(0, 1000)}...`;
        }
        return `AI callback failure details: ${serialized}`;
      } catch {
        return 'AI callback indicated failure';
      }
    }

    if (typeof result === 'string' && result.trim().length > 0) {
      return `AI callback failure details: ${result.trim()}`;
    }

    return 'AI callback indicated failure';
  }
}
