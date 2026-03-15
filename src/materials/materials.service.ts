import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AIJobStatus, MaterialStatus, Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMaterialInput,
  MaterialJobsQueryInput,
  QueryMaterialsInput,
  UpdateMaterialInput,
} from './materials.schemas';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
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
