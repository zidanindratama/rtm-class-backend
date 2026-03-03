import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassroomMemberRole, Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateClassInput,
  JoinClassInput,
  QueryClassMembersInput,
  QueryClassesInput,
} from './classes.schemas';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(user: JwtPayload, query: QueryClassesInput) {
    const where: Prisma.ClassroomWhereInput = {
      OR:
        user.role === UserRole.ADMIN
          ? undefined
          : [{ teacherId: user.sub }, { members: { some: { userId: user.sub } } }],
      name: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };

    const [totalItems, classes] = await this.prisma.$transaction([
      this.prisma.classroom.count({ where }),
      this.prisma.classroom.findMany({
        where,
        include: {
          teacher: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: { members: true, forumThreads: true },
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
      message: 'Classes fetched',
      data: classes,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async getClassById(user: JwtPayload, id: string) {
    await this.assertClassAccess(user, id);

    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, fullName: true, email: true },
        },
        _count: {
          select: { members: true, forumThreads: true },
        },
      },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    return {
      message: 'Class fetched',
      data: classroom,
    };
  }

  async createClass(user: JwtPayload, input: CreateClassInput) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only admin or teacher can create class');
    }

    const classCode = await this.generateUniqueClassCode();

    const classroom = await this.prisma.classroom.create({
      data: {
        ...input,
        classCode,
        teacherId: user.sub,
        members: {
          create: {
            userId: user.sub,
            role: ClassroomMemberRole.TEACHER,
          },
        },
      },
      include: {
        teacher: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Class created',
      data: classroom,
    };
  }

  async joinClassByCode(user: JwtPayload, input: JoinClassInput) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { classCode: input.classCode.toUpperCase() },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    const existingMember = await this.prisma.classroomMember.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: user.sub,
        },
      },
    });

    if (existingMember) {
      return {
        message: 'Already joined this class',
        data: existingMember,
      };
    }

    const role =
      user.role === UserRole.TEACHER || user.role === UserRole.ADMIN
        ? ClassroomMemberRole.TEACHER
        : ClassroomMemberRole.STUDENT;

    const member = await this.prisma.classroomMember.create({
      data: {
        classroomId: classroom.id,
        userId: user.sub,
        role,
      },
    });

    return {
      message: 'Joined class successfully',
      data: member,
    };
  }

  async listClassMembers(
    user: JwtPayload,
    classId: string,
    query: QueryClassMembersInput,
  ) {
    await this.assertClassAccess(user, classId);

    const where: Prisma.ClassroomMemberWhereInput = {
      classroomId: classId,
      user: query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };

    const [totalItems, members] = await this.prisma.$transaction([
      this.prisma.classroomMember.count({ where }),
      this.prisma.classroomMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isSuspended: true,
            },
          },
        },
        orderBy:
          query.sort_by === 'createdAt'
            ? { createdAt: clampSortOrder(query.sort_order) }
            : { user: { [query.sort_by]: clampSortOrder(query.sort_order) } },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      }),
    ]);

    return {
      message: 'Class members fetched',
      data: members,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async assertClassAccess(user: JwtPayload, classId: string) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: classId,
        OR: [{ teacherId: user.sub }, { members: { some: { userId: user.sub } } }],
      },
      select: { id: true },
    });

    if (!classroom) {
      throw new ForbiddenException('You do not have access to this class');
    }
  }

  private async generateUniqueClassCode(): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase();
      const exists = await this.prisma.classroom.findUnique({
        where: { classCode: code },
        select: { id: true },
      });
      if (!exists) {
        return code;
      }
    }

    throw new Error('Failed to generate unique class code');
  }
}
