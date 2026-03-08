import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialInput, QueryMaterialsInput } from './materials.schemas';

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

  async getMaterialOutputs(user: JwtPayload, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, classroomId: true },
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.classesService.assertClassAccess(user, material.classroomId);

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
}
