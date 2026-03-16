import {
  AIJobStatus,
  AIJobType,
  MaterialStatus,
  UserRole,
} from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueAiTransformInput } from './ai-jobs.schemas';
import { RedisService } from 'src/redis/redis.service';

const WORKER_INTERVAL_MS = 5000;
const OAUTH_CACHE_KEY = 'rtm:ai:oauth_token';
@Injectable()
export class AiJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiJobsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
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
  }

  async enqueue(user: JwtPayload, input: EnqueueAiTransformInput) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException(
        'Only admin or teacher can generate AI outputs',
      );
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

  private stringifyHttpPayload(payload: unknown): string {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return payload;

    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  private async getOAuthAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cachedToken = await this.redisService.get(OAUTH_CACHE_KEY);
    if (cachedToken) {
      return cachedToken;
    }

    const baseUrl = this.requireEnv('AI_BASE_URL');
    const clientId = this.requireEnv('AI_CLIENT_ID');
    const clientSecret = this.requireEnv('AI_CLIENT_SECRET');
    const scope = process.env.AI_SCOPE ?? 'material:write lkpd:write lkpd:read';
    const tokenEndpoint =
      process.env.AI_OAUTH_TOKEN_ENDPOINT ?? '/api/oauth/token';

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('scope', scope);

    const response = await firstValueFrom(
      this.httpService.post<{
        access_token?: string;
        expires_in?: number;
        data?: { access_token?: string; expires_in?: number };
      }>(`${baseUrl}${tokenEndpoint}`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
      }),
    );

    if (!this.isSuccessStatus(response.status)) {
      const errorText = this.stringifyHttpPayload(response.data);
      throw new UnauthorizedException(
        `Failed to obtain AI OAuth access token (${response.status})${errorText ? `: ${errorText}` : ''}`,
      );
    }

    const json = response.data;
    const token = json.access_token ?? json.data?.access_token;
    const expiresIn = json.expires_in ?? json.data?.expires_in ?? 300;
    if (!token) {
      throw new UnauthorizedException(
        'AI OAuth response does not contain access_token',
      );
    }

    const ttl = Math.max(30, expiresIn - 30);
    await this.redisService.setEx(OAUTH_CACHE_KEY, token, ttl);

    this.logger.debug(`AI OAuth token refreshed. expires_at=${now + ttl}`);
    return token;
  }

  async acknowledgeCallback(jobId: string) {
    const job = await this.prisma.aiJob.findUnique({
      where: { id: jobId },
      select: { id: true },
    });

    if (!job) {
      throw new NotFoundException('AI job not found');
    }

    return {
      message: 'AI callback acknowledged (no-op)',
      data: { jobId: job.id },
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
    requestedById: string;
    material: { fileUrl: string; fileMimeType: string | null };
  }) {
    try {
      const endpointPath = this.endpointPathFromJobType(job.type);
      const baseUrl = this.requireEnv('AI_BASE_URL');
      const accessToken = await this.getOAuthAccessToken();
      const materialFileResponse = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(job.material.fileUrl, {
          responseType: 'arraybuffer',
          validateStatus: () => true,
        }),
      );
      if (!this.isSuccessStatus(materialFileResponse.status)) {
        throw new Error(
          `Failed to download material file (${materialFileResponse.status})`,
        );
      }

      const blob = new Blob([materialFileResponse.data]);

      const parameters = (job.parameters ?? {}) as Record<string, unknown>;
      const form = new FormData();
      const uploadFilename = this.buildMaterialFilename(
        job.materialId,
        job.material.fileUrl,
        job.material.fileMimeType,
      );
      form.set('job_id', job.id);
      form.set('material_id', job.materialId);
      form.set('requested_by_id', job.requestedById);
      form.set('user_id', `material:${job.materialId}`);
      form.set('file', blob, uploadFilename);

      this.applyParametersByType(form, job.type, parameters);

      const response = await firstValueFrom(
        this.httpService.post(`${baseUrl}${endpointPath}`, form, {
          validateStatus: () => true,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      const responsePayload = response.data ?? null;
      if (!this.isSuccessStatus(response.status)) {
        const errorText =
          typeof responsePayload === 'object' && responsePayload !== null
            ? JSON.stringify(responsePayload)
            : `HTTP ${response.status}`;
        throw new Error(`AI request failed: ${errorText}`);
      }

      const normalized = this.normalizeAiDispatchResponse(responsePayload);
      if (normalized.externalJobId) {
        await this.prisma.aiJob.update({
          where: { id: job.id },
          data: {
            externalJobId: normalized.externalJobId,
          },
        });
      }
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
      form.set(
        'mcq_count',
        String(this.numberFromInput(parameters.mcqCount, 10)),
      );
      form.set('mcp_enabled', String(mcpEnabled));
      return;
    }

    if (type === AIJobType.ESSAY) {
      form.set(
        'essay_count',
        String(this.numberFromInput(parameters.essayCount, 5)),
      );
      form.set('mcp_enabled', String(mcpEnabled));
      return;
    }

    if (type === AIJobType.SUMMARY) {
      form.set(
        'summary_max_words',
        String(this.numberFromInput(parameters.summaryMaxWords, 200)),
      );
      form.set('mcp_enabled', String(mcpEnabled));
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

  private extractSupportedExtensionFromUrl(
    url: string,
  ): '.pdf' | '.pptx' | '.txt' | null {
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

  private extensionFromMimeType(
    mimeType: string | null,
  ): '.pdf' | '.pptx' | '.txt' | null {
    const normalized = mimeType?.trim().toLowerCase();
    if (!normalized) return null;

    if (normalized.includes('application/pdf')) return '.pdf';
    if (
      normalized.includes(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      )
    ) {
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

  private async refreshMaterialStatus(materialId: string): Promise<void> {
    const jobs = await this.prisma.aiJob.findMany({
      where: { materialId },
      select: { status: true },
    });

    let status: MaterialStatus = MaterialStatus.UPLOADED;
    if (
      jobs.some(
        (job) =>
          job.status === AIJobStatus.accepted ||
          job.status === AIJobStatus.processing,
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

  private normalizeAiDispatchResponse(payload: unknown): {
    externalJobId?: string;
  } {
    if (typeof payload !== 'object' || payload === null) {
      return {};
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
    return { externalJobId };
  }

  private requireEnv(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
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

  private isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
  }
}