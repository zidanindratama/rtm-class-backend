import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AIJobStatus,
  AIJobType,
  AssignmentStatus,
  AssignmentType,
  MaterialStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { AssignmentsService } from '../assignments/assignments.service';
import { ClassesService } from '../classes/classes.service';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssignmentFromOutputInput,
  CreateMaterialInput,
  EditAiOutputInput,
  MaterialJobsQueryInput,
  QueryMaterialsInput,
  SetAiOutputPublishInput,
  UpdateMaterialInput,
} from './materials.schemas';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async listMaterials(user: JwtPayload, query: QueryMaterialsInput) {
    if (query.classId) {
      await this.classesService.assertClassAccess(user, query.classId);
    }

    const where: Prisma.MaterialWhereInput = {
      classroomId: query.classId,
      title: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      classroom:
        user.role === UserRole.ADMIN
          ? undefined
          : {
              OR: [
                { teacherId: user.sub },
                { members: { some: { userId: user.sub } } },
              ],
            },
    };

    const [totalItems, materials] = await this.prisma.$transaction([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              classCode: true,
            },
          },
          uploadedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          _count: {
            select: { aiJobs: true, aiOutputs: true },
          },
        },
        orderBy: {
          [query.sort_by]: clampSortOrder(query.sort_order),
        },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      }),
    ]);

    return {
      message: 'Materials fetched',
      data: materials,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async getMaterialById(user: JwtPayload, id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            classCode: true,
            teacherId: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: { aiJobs: true, aiOutputs: true },
        },
      },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.classesService.assertClassAccess(user, material.classroomId);

    return {
      message: 'Material fetched',
      data: material,
    };
  }

  async createMaterial(user: JwtPayload, input: CreateMaterialInput) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only admin or teacher can create material');
    }

    await this.classesService.assertClassAccess(user, input.classId);

    const material = await this.prisma.material.create({
      data: {
        classroomId: input.classId,
        uploadedById: user.sub,
        title: input.title,
        description: input.description,
        fileUrl: input.fileUrl,
        fileMimeType: input.fileMimeType,
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            classCode: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      message: 'Material created',
      data: material,
    };
  }

  async updateMaterial(
    user: JwtPayload,
    id: string,
    input: UpdateMaterialInput,
  ) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      select: { id: true, classroomId: true },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.ensureCanManageMaterial(user, material.classroomId);

    const updated = await this.prisma.material.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        fileUrl: input.fileUrl,
        fileMimeType: input.fileMimeType,
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            classCode: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      message: 'Material updated',
      data: updated,
    };
  }

  async getMaterialOutputs(user: JwtPayload, materialId: string) {
    await this.getMaterialWithClassAccess(user, materialId);

    const outputs = await this.prisma.aiOutput.findMany({
      where: { materialId },
      include: {
        job: {
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Material AI outputs fetched',
      data: outputs,
    };
  }

  async getMaterialJobs(
    user: JwtPayload,
    materialId: string,
    query: MaterialJobsQueryInput,
  ) {
    const material = await this.getMaterialWithClassAccess(user, materialId);

    const jobs = await this.prisma.aiJob.findMany({
      where: { materialId },
      include: {
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        output: {
          select: {
            id: true,
            type: true,
            isPublished: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const includeOverview = query.includeOverview === true;
    const overview = includeOverview
      ? this.buildAiOverview(material.id, material.status, jobs)
      : undefined;

    return {
      message: 'Material AI jobs fetched',
      data: {
        materialId: material.id,
        materialStatus: material.status,
        jobs,
        overview,
      },
    };
  }

  async getMaterialAiOverview(user: JwtPayload, materialId: string) {
    const material = await this.getMaterialWithClassAccess(user, materialId);

    const jobs = await this.prisma.aiJob.findMany({
      where: { materialId },
      select: {
        id: true,
        type: true,
        status: true,
        output: {
          select: {
            id: true,
            isPublished: true,
          },
        },
      },
    });

    return {
      message: 'Material AI overview fetched',
      data: this.buildAiOverview(material.id, material.status, jobs),
    };
  }

  async editMaterialOutput(
    user: JwtPayload,
    materialId: string,
    outputId: string,
    input: EditAiOutputInput,
  ) {
    const output = await this.getOutputForMaterial(user, materialId, outputId);
    await this.ensureCanManageMaterial(user, output.material.classroomId);

    const updated = await this.prisma.aiOutput.update({
      where: { id: outputId },
      data: {
        editedContent: input.editedContent as Prisma.InputJsonValue,
      },
      include: {
        job: {
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    return {
      message: 'Material AI output updated',
      data: updated,
    };
  }

  async setMaterialOutputPublish(
    user: JwtPayload,
    materialId: string,
    outputId: string,
    input: SetAiOutputPublishInput,
  ) {
    const output = await this.getOutputForMaterial(user, materialId, outputId);
    await this.ensureCanManageMaterial(user, output.material.classroomId);

    const updated = await this.prisma.aiOutput.update({
      where: { id: outputId },
      data: {
        isPublished: input.publish,
        publishedAt: input.publish ? output.publishedAt ?? new Date() : null,
      },
      include: {
        job: {
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    return {
      message: input.publish
        ? 'Material AI output published'
        : 'Material AI output unpublished',
      data: updated,
    };
  }

  async createAssignmentFromOutput(
    user: JwtPayload,
    materialId: string,
    outputId: string,
    input: CreateAssignmentFromOutputInput,
  ) {
    const output = await this.getOutputForMaterial(user, materialId, outputId);
    await this.ensureCanManageMaterial(user, output.material.classroomId);

    const assignmentType = this.toAssignmentType(output.type);
    const content = this.toAssignmentContentFromOutput(
      output.type,
      output.editedContent ?? output.content,
    );

    const questionCount =
      assignmentType === AssignmentType.QUIZ_MCQ
        ? content.questionSet.mcq.length
        : content.questionSet.essay.length;

    if (questionCount < 1) {
      throw new BadRequestException(
        'Cannot create assignment: output has no valid questions',
      );
    }

    const maxScore = questionCount;
    const passingScore = Math.max(1, Math.ceil(maxScore * 0.7));
    const baseTitle = `${output.material.title} - ${output.type} Quiz`;

    const created = await this.assignmentsService.createAssignment(user, {
      classId: output.material.classroomId,
      materialId: output.material.id,
      title: input.title?.trim() || baseTitle,
      description:
        input.description?.trim() ||
        `Generated from ${output.type} AI output (${output.id}).`,
      type: assignmentType,
      content,
      passingScore,
      maxScore,
      dueAt: input.dueAt,
      status: input.status ?? AssignmentStatus.DRAFT,
    });

    return {
      message: 'Assignment created from material AI output',
      data: created.data,
    };
  }

  async deleteMaterial(user: JwtPayload, id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      select: {
        id: true,
        classroomId: true,
        uploadedById: true,
        classroom: {
          select: { teacherId: true },
        },
      },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    this.assertMaterialOwnerOrAdmin(user, {
      uploadedById: material.uploadedById,
      classTeacherId: material.classroom.teacherId,
    });

    await this.prisma.material.delete({
      where: { id },
    });

    return {
      message: 'Material deleted',
      data: null,
    };
  }

  private async ensureCanManageMaterial(user: JwtPayload, classId: string) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only admin or teacher can manage material');
    }

    await this.classesService.assertClassAccess(user, classId);
  }

  private async getMaterialWithClassAccess(user: JwtPayload, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, classroomId: true, status: true },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.classesService.assertClassAccess(user, material.classroomId);
    return material;
  }

  private buildAiOverview(
    materialId: string,
    materialStatus: MaterialStatus,
    jobs: Array<{
      id: string;
      type: string;
      status: AIJobStatus;
      output?: { id: string; isPublished?: boolean | null } | null;
    }>,
  ) {
    const jobsByStatus = {
      accepted: 0,
      processing: 0,
      succeeded: 0,
      failed_processing: 0,
      failed_delivery: 0,
    };

    const jobsByType = {
      MCQ: 0,
      ESSAY: 0,
      SUMMARY: 0,
      LKPD: 0,
      REMEDIAL: 0,
      DISCUSSION_TOPIC: 0,
    };

    let outputCount = 0;
    let publishedOutputCount = 0;
    for (const job of jobs) {
      if (job.status in jobsByStatus) {
        jobsByStatus[job.status] += 1;
      }

      if (job.type in jobsByType) {
        jobsByType[job.type as keyof typeof jobsByType] += 1;
      }

      if (job.output) {
        outputCount += 1;
        if (job.output.isPublished) {
          publishedOutputCount += 1;
        }
      }
    }

    const totalJobs = jobs.length;
    const completedJobs = jobsByStatus.succeeded;
    const failedJobs =
      jobsByStatus.failed_processing + jobsByStatus.failed_delivery;
    const inProgressJobs = jobsByStatus.accepted + jobsByStatus.processing;

    const completionRate =
      totalJobs > 0
        ? Number(((completedJobs / totalJobs) * 100).toFixed(2))
        : 0;

    return {
      materialId,
      materialStatus,
      totalJobs,
      completedJobs,
      failedJobs,
      inProgressJobs,
      completionRate,
      hasPendingJobs: inProgressJobs > 0,
      jobsByStatus,
      jobsByType,
      outputCount,
      publishedOutputCount,
    };
  }

  private async getOutputForMaterial(
    user: JwtPayload,
    materialId: string,
    outputId: string,
  ) {
    const output = await this.prisma.aiOutput.findFirst({
      where: {
        id: outputId,
        materialId,
      },
      include: {
        material: {
          select: {
            id: true,
            title: true,
            classroomId: true,
          },
        },
      },
    });

    if (!output) {
      throw new NotFoundException('Material AI output not found');
    }

    await this.classesService.assertClassAccess(user, output.material.classroomId);
    return output;
  }

  private toAssignmentType(outputType: AIJobType): AssignmentType {
    if (outputType === AIJobType.MCQ) return AssignmentType.QUIZ_MCQ;
    if (outputType === AIJobType.ESSAY) return AssignmentType.QUIZ_ESSAY;

    throw new BadRequestException(
      'Only MCQ or ESSAY outputs can be converted to assignment',
    );
  }

  private toAssignmentContentFromOutput(
    outputType: AIJobType,
    payload: Prisma.JsonValue | null,
  ) {
    const root = this.asRecord(payload);
    if (!root) {
      throw new BadRequestException('AI output payload is invalid');
    }

    if (outputType === AIJobType.MCQ) {
      const mcqQuestions = this.parseMcqQuestions(root);
      return {
        richTextHtml: '',
        questionSet: {
          mcq: mcqQuestions,
          essay: [],
        },
      };
    }

    const essayQuestions = this.parseEssayQuestions(root);
    return {
      richTextHtml: '',
      questionSet: {
        mcq: [],
        essay: essayQuestions,
      },
    };
  }

  private parseMcqQuestions(root: Record<string, unknown>) {
    const quiz = this.asRecord(root.mcq_quiz);
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];

    return questions
      .map((item, index) => {
        const row = this.asRecord(item);
        if (!row) return null;

        const question =
          typeof row.question === 'string' ? row.question.trim() : '';
        const options = Array.isArray(row.options)
          ? row.options
              .filter((option): option is string => typeof option === 'string')
              .map((option) => option.trim())
              .filter((option) => option.length > 0)
          : [];

        if (!question || options.length !== 4) {
          return null;
        }

        const correctOption = this.resolveCorrectOption(
          row.correct_answer,
          options,
        );

        return {
          id: `mcq-${index + 1}`,
          question,
          options,
          correctOption,
          points: 1,
        };
      })
      .filter(
        (
          row,
        ): row is {
          id: string;
          question: string;
          options: string[];
          correctOption: 'A' | 'B' | 'C' | 'D';
          points: number;
        } => Boolean(row),
      );
  }

  private parseEssayQuestions(root: Record<string, unknown>) {
    const quiz = this.asRecord(root.essay_quiz);
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];

    return questions
      .map((item, index) => {
        const row = this.asRecord(item);
        if (!row) return null;

        const question =
          typeof row.question === 'string' ? row.question.trim() : '';
        if (!question) {
          return null;
        }

        const answerGuide =
          typeof row.expected_points === 'string'
            ? row.expected_points.trim() || undefined
            : undefined;

        return {
          id: `essay-${index + 1}`,
          question,
          answerGuide,
          points: 1,
        };
      })
      .filter(
        (
          row,
        ): row is {
          id: string;
          question: string;
          answerGuide: string | undefined;
          points: number;
        } => Boolean(row),
      );
  }

  private resolveCorrectOption(
    value: unknown,
    options: string[],
  ): 'A' | 'B' | 'C' | 'D' {
    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      if (
        normalized === 'A' ||
        normalized === 'B' ||
        normalized === 'C' ||
        normalized === 'D'
      ) {
        return normalized;
      }

      const optionIndex = options.findIndex(
        (option) => option.trim().toLowerCase() === value.trim().toLowerCase(),
      );
      if (optionIndex === 0) return 'A';
      if (optionIndex === 1) return 'B';
      if (optionIndex === 2) return 'C';
      if (optionIndex === 3) return 'D';
    }

    return 'A';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private assertMaterialOwnerOrAdmin(
    user: JwtPayload,
    ownership: { uploadedById: string; classTeacherId: string },
  ) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only material owner or admin can do this');
    }

    if (
      user.sub !== ownership.uploadedById &&
      user.sub !== ownership.classTeacherId
    ) {
      throw new ForbiddenException('Only material owner or admin can do this');
    }
  }
}
