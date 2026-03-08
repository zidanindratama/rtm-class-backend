import {
  AssignmentStatus,
  AssignmentSubmission,
  Prisma,
  SubmissionStatus,
  UserRole,
} from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssignmentInput,
  GradeSubmissionInput,
  PublishAssignmentInput,
  QueryAssignmentsInput,
  QueryGradebookInput,
  QuerySubmissionsInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
} from './assignments.schemas';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
  ) {}

  async listAssignments(user: JwtPayload, query: QueryAssignmentsInput) {
    if (query.classId) {
      await this.classesService.assertClassAccess(user, query.classId);
    }

    const where: Prisma.AssignmentWhereInput = {
      classroomId: query.classId,
      type: query.type,
      status: query.status,
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

    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.assignment.count({ where }),
      this.prisma.assignment.findMany({
        where,
        include: {
          classroom: {
            select: { id: true, name: true, classCode: true },
          },
          createdBy: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          _count: {
            select: { submissions: true },
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
      message: 'Assignments fetched',
      data: items,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async getAssignmentById(user: JwtPayload, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        classroom: {
          select: { id: true, name: true, classCode: true, teacherId: true },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.classesService.assertClassAccess(user, assignment.classroomId);

    return {
      message: 'Assignment fetched',
      data: assignment,
    };
  }

  async createAssignment(user: JwtPayload, input: CreateAssignmentInput) {
    await this.ensureCanManageClassContent(user, input.classId);

    if (input.materialId) {
      const material = await this.prisma.material.findUnique({
        where: { id: input.materialId },
        select: { id: true, classroomId: true },
      });
      if (!material || material.classroomId !== input.classId) {
        throw new NotFoundException('Material not found in this class');
      }
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        classroomId: input.classId,
        materialId: input.materialId,
        createdById: user.sub,
        title: input.title,
        description: input.description,
        type: input.type,
        status: input.status ?? AssignmentStatus.DRAFT,
        content: this.toInputJsonValue(input.content),
        passingScore: input.passingScore,
        maxScore: input.maxScore,
        dueAt: input.dueAt,
        publishedAt:
          input.status === AssignmentStatus.PUBLISHED ? new Date() : null,
      },
      include: {
        classroom: {
          select: { id: true, name: true, classCode: true },
        },
      },
    });

    return {
      message: 'Assignment created',
      data: assignment,
    };
  }

  async updateAssignment(
    user: JwtPayload,
    id: string,
    input: UpdateAssignmentInput,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    if (input.materialId) {
      const material = await this.prisma.material.findUnique({
        where: { id: input.materialId },
        select: { id: true, classroomId: true },
      });
      if (!material || material.classroomId !== assignment.classroomId) {
        throw new NotFoundException('Material not found in this class');
      }
    }

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        materialId: input.materialId,
        title: input.title,
        description: input.description,
        type: input.type,
        status: input.status,
        content:
          input.content !== undefined
            ? this.toInputJsonValue(input.content)
            : undefined,
        passingScore: input.passingScore,
        maxScore: input.maxScore,
        dueAt: input.dueAt,
        publishedAt:
          input.status === AssignmentStatus.PUBLISHED
            ? (assignment.publishedAt ?? new Date())
            : input.status === AssignmentStatus.DRAFT
              ? null
              : undefined,
      },
      include: {
        classroom: {
          select: { id: true, name: true, classCode: true },
        },
      },
    });

    return {
      message: 'Assignment updated',
      data: updated,
    };
  }

  async publishAssignment(
    user: JwtPayload,
    id: string,
    input: PublishAssignmentInput,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    const published = input.published ?? true;
    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        status: published ? AssignmentStatus.PUBLISHED : AssignmentStatus.DRAFT,
        publishedAt: published
          ? (input.publishedAt ?? assignment.publishedAt ?? new Date())
          : null,
      },
    });

    return {
      message: published ? 'Assignment published' : 'Assignment unpublished',
      data: updated,
    };
  }

  async submitAssignment(
    user: JwtPayload,
    assignmentId: string,
    input: SubmitAssignmentInput,
  ) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can submit assignments');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, classroomId: true, status: true, dueAt: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.classesService.assertClassAccess(user, assignment.classroomId);

    if (assignment.status !== AssignmentStatus.PUBLISHED) {
      throw new ForbiddenException('Assignment is not published');
    }

    if (assignment.dueAt && assignment.dueAt.getTime() < Date.now()) {
      throw new ForbiddenException('Assignment deadline has passed');
    }

    const submission = await this.prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: user.sub,
        },
      },
      create: {
        assignmentId,
        studentId: user.sub,
        answers: this.toInputJsonValue(input.answers),
        status: SubmissionStatus.SUBMITTED,
      },
      update: {
        answers: this.toInputJsonValue(input.answers),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
        score: null,
        feedback: null,
        gradedAt: null,
        gradedById: null,
      },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Assignment submitted',
      data: submission,
    };
  }

  async listSubmissions(
    user: JwtPayload,
    assignmentId: string,
    query: QuerySubmissionsInput,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, classroomId: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    const where: Prisma.AssignmentSubmissionWhereInput = {
      assignmentId,
      status: query.status,
      studentId: query.studentId,
      student: query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };

    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.assignmentSubmission.count({ where }),
      this.prisma.assignmentSubmission.findMany({
        where,
        include: {
          student: {
            select: { id: true, fullName: true, email: true },
          },
          gradedBy: {
            select: { id: true, fullName: true, email: true },
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
      message: 'Assignment submissions fetched',
      data: items,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async gradeSubmission(
    user: JwtPayload,
    submissionId: string,
    input: GradeSubmissionInput,
  ) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          select: { id: true, classroomId: true, maxScore: true },
        },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    await this.ensureCanManageClassContent(
      user,
      submission.assignment.classroomId,
    );

    if (input.score > submission.assignment.maxScore) {
      throw new ForbiddenException('Score exceeds assignment maxScore');
    }

    const graded = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: input.score,
        feedback: input.feedback,
        status: input.status,
        gradedAt: new Date(),
        gradedById: user.sub,
      },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Submission graded',
      data: graded,
    };
  }

  async getClassGradebook(
    user: JwtPayload,
    classId: string,
    query: QueryGradebookInput,
  ) {
    await this.ensureCanManageClassContent(user, classId);

    const students = await this.prisma.classroomMember.findMany({
      where: {
        classroomId: classId,
        user: {
          role: UserRole.STUDENT,
          OR: query.search
            ? [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    const assignments = await this.prisma.assignment.findMany({
      where: {
        classroomId: classId,
        status: AssignmentStatus.PUBLISHED,
      },
      select: { id: true },
    });

    const assignmentIds = assignments.map((assignment) => assignment.id);
    const submissionByStudent = new Map<string, AssignmentSubmission[]>();

    if (assignmentIds.length > 0 && students.length > 0) {
      const submissions = await this.prisma.assignmentSubmission.findMany({
        where: {
          assignmentId: { in: assignmentIds },
          studentId: { in: students.map((member) => member.userId) },
        },
      });

      for (const submission of submissions) {
        const current = submissionByStudent.get(submission.studentId) ?? [];
        current.push(submission);
        submissionByStudent.set(submission.studentId, current);
      }
    }

    const rows = students.map((member) => {
      const submissions = submissionByStudent.get(member.userId) ?? [];
      const graded = submissions.filter(
        (submission) => typeof submission.score === 'number',
      );
      const avgScore =
        graded.length > 0
          ? graded.reduce((sum, row) => sum + (row.score ?? 0), 0) /
            graded.length
          : null;
      const submissionRate =
        assignmentIds.length > 0
          ? (submissions.length / assignmentIds.length) * 100
          : 0;

      return {
        student: member.user,
        totalAssignments: assignmentIds.length,
        submittedCount: submissions.length,
        gradedCount: graded.length,
        avgScore,
        submissionRate,
      };
    });

    rows.sort((a, b) => {
      const order = query.sort_order === 'asc' ? 1 : -1;
      const key = query.sort_by;
      if (key === 'avgScore' || key === 'submissionRate') {
        const av = (a[key] ?? -1) as number;
        const bv = (b[key] ?? -1) as number;
        return av === bv ? 0 : av > bv ? order : -order;
      }
      const av = (a.student[key as 'fullName' | 'email'] ?? '').toLowerCase();
      const bv = (b.student[key as 'fullName' | 'email'] ?? '').toLowerCase();
      if (av === bv) return 0;
      return av > bv ? order : -order;
    });

    const paged = rows.slice(
      (query.page - 1) * query.per_page,
      query.page * query.per_page,
    );

    return {
      message: 'Class gradebook fetched',
      data: paged,
      meta: buildListMeta(rows.length, query.page, query.per_page),
    };
  }

  async deleteAssignment(user: JwtPayload, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    await this.prisma.assignment.delete({ where: { id } });

    return {
      message: 'Assignment deleted',
      data: null,
    };
  }

  private async ensureCanManageClassContent(user: JwtPayload, classId: string) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException(
        'Only admin or teacher can manage class assignments',
      );
    }

    await this.classesService.assertClassAccess(user, classId);
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
}
