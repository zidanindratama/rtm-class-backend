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
  UpdateClassInput,
} from './classes.schemas';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(user: JwtPayload, query: QueryClassesInput) {
    const where: Prisma.ClassroomWhereInput = {
      OR:
        user.role === UserRole.ADMIN
          ? undefined
          : [
              { teacherId: user.sub },
              { members: { some: { userId: user.sub } } },
            ],
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

  async updateClass(user: JwtPayload, id: string, input: UpdateClassInput) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    await this.ensureCanManageClassContent(user, id);

    const updated = await this.prisma.classroom.update({
      where: { id },
      data: {
        name: input.name,
        institutionName: input.institutionName,
        classLevel: input.classLevel,
        academicYear: input.academicYear,
        description: input.description,
      },
      include: {
        teacher: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Class updated',
      data: updated,
    };
  }

  async deleteClass(user: JwtPayload, id: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    this.assertClassOwnerOrAdmin(user, classroom.teacherId);

    await this.prisma.classroom.delete({
      where: { id },
    });

    return {
      message: 'Class deleted',
      data: null,
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
        OR: [
          { teacherId: user.sub },
          { members: { some: { userId: user.sub } } },
        ],
      },
      select: { id: true },
    });

    if (!classroom) {
      throw new ForbiddenException('You do not have access to this class');
    }
  }

  async leaveClass(user: JwtPayload, classId: string) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can leave class');
    }

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    if (classroom.teacherId === user.sub) {
      throw new ForbiddenException('Class owner cannot leave class');
    }

    const membership = await this.prisma.classroomMember.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classId,
          userId: user.sub,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this class');
    }

    await this.prisma.classroomMember.delete({
      where: { id: membership.id },
    });

    return {
      message: 'Left class successfully',
      data: null,
    };
  }

  async removeClassMember(user: JwtPayload, classId: string, userId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      select: { id: true, teacherId: true },
    });

    if (!classroom) {
      throw new NotFoundException('Class not found');
    }

    this.assertClassOwnerOrAdmin(user, classroom.teacherId);

    if (userId === classroom.teacherId) {
      throw new ForbiddenException('Cannot remove class owner');
    }

    const membership = await this.prisma.classroomMember.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classId,
          userId,
        },
      },
      select: { id: true, userId: true, role: true },
    });

    if (!membership) {
      throw new NotFoundException('Class member not found');
    }

    await this.prisma.classroomMember.delete({
      where: { id: membership.id },
    });

    return {
      message: 'Class member removed',
      data: membership,
    };
  }

  private async ensureCanManageClassContent(user: JwtPayload, classId: string) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only admin or teacher can manage class');
    }

    await this.assertClassAccess(user, classId);
  }

  private assertClassOwnerOrAdmin(user: JwtPayload, teacherId: string) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role !== UserRole.TEACHER || user.sub !== teacherId) {
      throw new ForbiddenException('Only class owner or admin can do this');
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
