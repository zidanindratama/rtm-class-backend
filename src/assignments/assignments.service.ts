import {
  AssignmentQuestionType,
  AssignmentType,
  AssignmentStatus,
  AssignmentSubmission,
  Prisma,
  SubmissionStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
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
  QuerySubmissionAttemptsInput,
  QuerySubmissionsInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
} from './assignments.schemas';

type OptionLabel = 'A' | 'B' | 'C' | 'D';

type NormalizedAssignmentMcqQuestion = {
  id: string;
  question: string;
  options: string[];
  correctOption: OptionLabel;
  points: number;
};

type NormalizedAssignmentEssayQuestion = {
  id: string;
  question: string;
  answerGuide: string | undefined;
  points: number;
};

type NormalizedAssignmentContent = {
  richTextHtml: string;
  questionSet: {
    mcq: NormalizedAssignmentMcqQuestion[];
    essay: NormalizedAssignmentEssayQuestion[];
  };
};

type McqSubmitAnswers = {
  format: 'MCQ';
  responses: Array<{ questionId: string; answer: OptionLabel }>;
};

type EssaySubmitAnswers = {
  format: 'ESSAY';
  responses: Array<{ questionId: string; answer: string }>;
};

type TextSubmitAnswers = {
  format: 'TEXT';
  text: string;
  attachments?: string[];
};

type GenericSubmitAnswers = {
  format: 'GENERIC';
  payload: Record<string, unknown>;
};

type NormalizedSubmitAnswers =
  | McqSubmitAnswers
  | EssaySubmitAnswers
  | TextSubmitAnswers
  | GenericSubmitAnswers;

type NormalizedSubmissionAttachment = {
  fileUrl: string;
  fileName?: string;
  fileMimeType?: string;
};

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
    this.assertValidScorePolicy(input.passingScore, input.maxScore);
    const normalizedContent = this.normalizeAssignmentContent(input.content);
    this.assertContentMatchesAssignmentType(input.type, normalizedContent);
    this.assertQuestionPointsWithinMaxScore(normalizedContent, input.maxScore);

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
        content: this.toInputJsonValue(normalizedContent),
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
    if (assignment.status === AssignmentStatus.CLOSED) {
      throw new ForbiddenException('Closed assignment cannot be updated');
    }

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    const nextMaxScore = input.maxScore ?? assignment.maxScore;
    const nextPassingScore = input.passingScore ?? assignment.passingScore;
    this.assertValidScorePolicy(nextPassingScore, nextMaxScore);

    const nextType = input.type ?? assignment.type;
    const normalizedContent =
      input.content !== undefined
        ? this.normalizeAssignmentContent(input.content)
        : this.normalizeAssignmentContent(assignment.content);
    this.assertContentMatchesAssignmentType(nextType, normalizedContent);
    this.assertQuestionPointsWithinMaxScore(normalizedContent, nextMaxScore);

    if (input.materialId) {
      const material = await this.prisma.material.findUnique({
        where: { id: input.materialId },
        select: { id: true, classroomId: true },
      });
      if (!material || material.classroomId !== assignment.classroomId) {
        throw new NotFoundException('Material not found in this class');
      }
    }

    const hasSubmissions = await this.prisma.assignmentSubmission.count({
      where: { assignmentId: assignment.id },
    });

    if (hasSubmissions > 0) {
      const hasAssessmentCoreChange =
        input.type !== undefined ||
        input.maxScore !== undefined ||
        input.passingScore !== undefined ||
        input.content !== undefined;

      if (hasAssessmentCoreChange) {
        throw new ForbiddenException(
          'Cannot change assignment type/scoring/content after submissions exist',
        );
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
            ? this.toInputJsonValue(normalizedContent)
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

  async closeAssignment(user: JwtPayload, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.ensureCanManageClassContent(user, assignment.classroomId);

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        status: AssignmentStatus.CLOSED,
      },
    });

    return {
      message: 'Assignment closed',
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
      select: {
        id: true,
        classroomId: true,
        status: true,
        dueAt: true,
        type: true,
        content: true,
        maxScore: true,
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.classesService.assertClassAccess(user, assignment.classroomId);

    if (assignment.status !== AssignmentStatus.PUBLISHED) {
      throw new ForbiddenException('Assignment is not published');
    }

    if (assignment.dueAt && assignment.dueAt.getTime() < Date.now()) {
      throw new ForbiddenException('Assignment deadline has passed');
    }

    const normalizedContent = this.normalizeAssignmentContent(
      assignment.content,
    );
    const normalizedAnswers = this.normalizeSubmitAnswers(input.answers);
    this.assertAnswersMatchAssignmentType(
      assignment.type,
      normalizedContent,
      normalizedAnswers,
    );

    const autoGrading = this.tryAutoGradeMcqSubmission({
      assignmentType: assignment.type,
      assignmentMaxScore: assignment.maxScore,
      content: normalizedContent,
      answers: normalizedAnswers,
    });
    const normalizedAttachments = this.normalizeSubmissionAttachments(input);

    const submissionId = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.assignmentSubmission.upsert({
        where: {
          assignmentId_studentId: {
            assignmentId,
            studentId: user.sub,
          },
        },
        create: {
          assignmentId,
          studentId: user.sub,
          answers: this.toInputJsonValue(normalizedAnswers),
          status: autoGrading?.status ?? SubmissionStatus.SUBMITTED,
          score: autoGrading?.score ?? null,
          feedback: autoGrading?.feedback ?? null,
          gradedAt: autoGrading?.gradedAt ?? null,
          gradedById: null,
        },
        update: {
          answers: this.toInputJsonValue(normalizedAnswers),
          status: autoGrading?.status ?? SubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
          score: autoGrading?.score ?? null,
          feedback: autoGrading?.feedback ?? null,
          gradedAt: autoGrading?.gradedAt ?? null,
          gradedById: null,
        },
        select: { id: true },
      });

      const lastAttempt = await tx.assignmentSubmissionAttempt.findFirst({
        where: { submissionId: upserted.id },
        select: { attemptNumber: true },
        orderBy: { attemptNumber: 'desc' },
      });
      const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

      const createdAttempt = await tx.assignmentSubmissionAttempt.create({
        data: {
          submissionId: upserted.id,
          attemptNumber,
          answers: this.toInputJsonValue(normalizedAnswers),
          status: autoGrading?.status ?? SubmissionStatus.SUBMITTED,
          score: autoGrading?.score ?? null,
          feedback: autoGrading?.feedback ?? null,
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      if (normalizedAttachments.length > 0) {
        await tx.assignmentSubmissionAttachment.createMany({
          data: normalizedAttachments.map((attachment) => ({
            submissionId: upserted.id,
            attemptId: createdAttempt.id,
            fileUrl: attachment.fileUrl,
            fileName: attachment.fileName,
            fileMimeType: attachment.fileMimeType,
          })),
        });
      }

      const questionGrades = this.buildAutoMcqQuestionGrades({
        assignmentType: assignment.type,
        content: normalizedContent,
        answers: normalizedAnswers,
      });

      if (questionGrades.length > 0) {
        await tx.assignmentQuestionGrade.deleteMany({
          where: {
            submissionId: upserted.id,
            attemptId: createdAttempt.id,
          },
        });

        await tx.assignmentQuestionGrade.createMany({
          data: questionGrades.map((row) => ({
            submissionId: upserted.id,
            attemptId: createdAttempt.id,
            questionId: row.questionId,
            questionType: row.questionType,
            score: row.score,
            maxScore: row.maxScore,
            isCorrect: row.isCorrect,
            feedback: row.feedback,
            gradedById: null,
            gradedAt: new Date(),
          })),
        });
      }

      return upserted.id;
    });

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        attempts: {
          select: { id: true, attemptNumber: true, submittedAt: true },
          orderBy: { attemptNumber: 'desc' },
          take: 3,
        },
        _count: {
          select: { attempts: true, attachments: true, questionGrades: true },
        },
      },
    });

    return {
      message: 'Assignment submitted',
      data: submission,
    };
  }

  async getMySubmission(user: JwtPayload, assignmentId: string) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can access this endpoint');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, classroomId: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.classesService.assertClassAccess(user, assignment.classroomId);

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: user.sub,
        },
      },
      include: {
        gradedBy: {
          select: { id: true, fullName: true, email: true },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
        questionGrades: {
          orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            gradedBy: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          include: {
            attachments: {
              orderBy: { createdAt: 'desc' },
            },
            questionGrades: {
              orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
              include: {
                gradedBy: {
                  select: { id: true, fullName: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return {
      message: 'My submission fetched',
      data: submission,
    };
  }

  async listMySubmissionAttempts(
    user: JwtPayload,
    assignmentId: string,
    query: QuerySubmissionAttemptsInput,
  ) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can access this endpoint');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, classroomId: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.classesService.assertClassAccess(user, assignment.classroomId);

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: user.sub,
        },
      },
      select: { id: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return this.listAttemptsBySubmissionId(submission.id, query);
  }

  async listSubmissionAttempts(
    user: JwtPayload,
    submissionId: string,
    query: QuerySubmissionAttemptsInput,
  ) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          select: { classroomId: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    await this.ensureCanManageClassContent(
      user,
      submission.assignment.classroomId,
    );

    return this.listAttemptsBySubmissionId(submissionId, query);
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
          attachments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          attempts: {
            select: { id: true, attemptNumber: true, submittedAt: true },
            orderBy: { attemptNumber: 'desc' },
            take: 1,
          },
          _count: {
            select: { attempts: true, attachments: true, questionGrades: true },
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
    if (input.attemptId) {
      const attempt = await this.prisma.assignmentSubmissionAttempt.findUnique({
        where: { id: input.attemptId },
        select: { id: true, submissionId: true },
      });
      if (!attempt || attempt.submissionId !== submissionId) {
        throw new BadRequestException(
          'attemptId is invalid for this submission',
        );
      }
    }

    if (input.questionGrades && input.questionGrades.length > 0) {
      for (const row of input.questionGrades) {
        if (row.score > row.maxScore) {
          throw new BadRequestException(
            `Question grade score cannot exceed maxScore (${row.questionId})`,
          );
        }
      }
    }

    const graded = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assignmentSubmission.update({
        where: { id: submissionId },
        data: {
          score: input.score,
          feedback: input.feedback,
          status: input.status,
          gradedAt: new Date(),
          gradedById: user.sub,
        },
      });

      if (input.attemptId) {
        await tx.assignmentSubmissionAttempt.update({
          where: { id: input.attemptId },
          data: {
            score: input.score,
            feedback: input.feedback,
            status: input.status,
          },
        });
      }

      if (input.questionGrades && input.questionGrades.length > 0) {
        await tx.assignmentQuestionGrade.deleteMany({
          where: {
            submissionId,
            attemptId: input.attemptId ?? null,
            questionId: { in: input.questionGrades.map((row) => row.questionId) },
          },
        });

        await tx.assignmentQuestionGrade.createMany({
          data: input.questionGrades.map((row) => ({
            submissionId,
            attemptId: input.attemptId ?? null,
            questionId: row.questionId,
            questionType: row.questionType,
            score: row.score,
            maxScore: row.maxScore,
            isCorrect: row.isCorrect,
            feedback: row.feedback,
            gradedById: user.sub,
            gradedAt: new Date(),
          })),
        });
      }

      return updated;
    });

    const gradedWithRelations = await this.prisma.assignmentSubmission.findUnique({
      where: { id: graded.id },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        gradedBy: {
          select: { id: true, fullName: true, email: true },
        },
        questionGrades: {
          orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            gradedBy: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
      },
    });

    return {
      message: 'Submission graded',
      data: gradedWithRelations,
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

  private async listAttemptsBySubmissionId(
    submissionId: string,
    query: QuerySubmissionAttemptsInput,
  ) {
    const where: Prisma.AssignmentSubmissionAttemptWhereInput = {
      submissionId,
    };

    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.assignmentSubmissionAttempt.count({ where }),
      this.prisma.assignmentSubmissionAttempt.findMany({
        where,
        include: {
          attachments: {
            orderBy: { createdAt: 'desc' },
          },
          questionGrades: {
            orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
            include: {
              gradedBy: {
                select: { id: true, fullName: true, email: true },
              },
            },
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
      message: 'Submission attempts fetched',
      data: items,
      meta: buildListMeta(totalItems, query.page, query.per_page),
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

  private assertValidScorePolicy(passingScore: number, maxScore: number) {
    if (passingScore > maxScore) {
      throw new BadRequestException(
        'passingScore must be less than or equal to maxScore',
      );
    }
  }

  private normalizeAssignmentContent(
    content: unknown,
  ): NormalizedAssignmentContent {
    const empty: NormalizedAssignmentContent = {
      richTextHtml: '',
      questionSet: {
        mcq: [],
        essay: [],
      },
    };

    if (!content || typeof content !== 'object') {
      return empty;
    }

    const source = content as Record<string, unknown>;
    const questionSet =
      source.questionSet && typeof source.questionSet === 'object'
        ? (source.questionSet as Record<string, unknown>)
        : {};

    const mcqRaw = Array.isArray(questionSet.mcq) ? questionSet.mcq : [];
    const essayRaw = Array.isArray(questionSet.essay) ? questionSet.essay : [];

    const mcq: NormalizedAssignmentMcqQuestion[] = mcqRaw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const options = Array.isArray(row.options)
          ? row.options.filter(
              (option): option is string => typeof option === 'string',
            )
          : [];
        const rawCorrect = row.correctOption;
        const correctOption =
          rawCorrect === 'A' ||
          rawCorrect === 'B' ||
          rawCorrect === 'C' ||
          rawCorrect === 'D'
            ? rawCorrect
            : null;

        if (
          typeof row.question !== 'string' ||
          !row.question.trim() ||
          options.length !== 4 ||
          !correctOption
        ) {
          return null;
        }

        return {
          id:
            typeof row.id === 'string' && row.id.trim()
              ? row.id.trim()
              : `mcq-${index + 1}`,
          question: row.question.trim(),
          options: options.map((option) => option.trim()),
          correctOption,
          points:
            typeof row.points === 'number' && Number.isFinite(row.points)
              ? Math.max(0, Math.round(row.points))
              : 1,
        };
      })
      .filter((row): row is NormalizedAssignmentMcqQuestion => Boolean(row));

    const essay: NormalizedAssignmentEssayQuestion[] = essayRaw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        if (typeof row.question !== 'string' || !row.question.trim()) {
          return null;
        }

        return {
          id:
            typeof row.id === 'string' && row.id.trim()
              ? row.id.trim()
              : `essay-${index + 1}`,
          question: row.question.trim(),
          answerGuide:
            typeof row.answerGuide === 'string' && row.answerGuide.trim()
              ? row.answerGuide.trim()
              : undefined,
          points:
            typeof row.points === 'number' && Number.isFinite(row.points)
              ? Math.max(0, Math.round(row.points))
              : 1,
        };
      })
      .filter((row): row is NormalizedAssignmentEssayQuestion => Boolean(row));

    return {
      richTextHtml:
        typeof source.richTextHtml === 'string'
          ? source.richTextHtml.trim()
          : '',
      questionSet: {
        mcq,
        essay,
      },
    };
  }

  private assertContentMatchesAssignmentType(
    type: AssignmentType,
    content: NormalizedAssignmentContent,
  ) {
    if (type === 'QUIZ_MCQ' && content.questionSet.mcq.length === 0) {
      throw new BadRequestException(
        'QUIZ_MCQ requires at least one MCQ question in content.questionSet.mcq',
      );
    }

    if (type === 'QUIZ_ESSAY' && content.questionSet.essay.length === 0) {
      throw new BadRequestException(
        'QUIZ_ESSAY requires at least one essay question in content.questionSet.essay',
      );
    }
  }

  private assertQuestionPointsWithinMaxScore(
    content: NormalizedAssignmentContent,
    maxScore: number,
  ) {
    const totalQuestionPoints =
      content.questionSet.mcq.reduce((sum, row) => sum + row.points, 0) +
      content.questionSet.essay.reduce((sum, row) => sum + row.points, 0);

    if (totalQuestionPoints > maxScore) {
      throw new BadRequestException(
        'Total question points cannot exceed assignment maxScore',
      );
    }
  }

  private normalizeSubmitAnswers(
    answers: SubmitAssignmentInput['answers'],
  ): NormalizedSubmitAnswers {
    if (!answers || typeof answers !== 'object') {
      throw new BadRequestException('answers must be a valid object payload');
    }

    const source = answers as Record<string, unknown>;
    const format = source.format;

    if (format === 'MCQ') {
      const responses = Array.isArray(source.responses) ? source.responses : [];
      return {
        format: 'MCQ',
        responses: responses
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const answer = row.answer;
            const isOption =
              answer === 'A' ||
              answer === 'B' ||
              answer === 'C' ||
              answer === 'D';
            if (
              typeof row.questionId !== 'string' ||
              !row.questionId.trim() ||
              !isOption
            ) {
              return null;
            }

            return { questionId: row.questionId.trim(), answer };
          })
          .filter((row): row is { questionId: string; answer: OptionLabel } =>
            Boolean(row),
          ),
      };
    }

    if (format === 'ESSAY') {
      const responses = Array.isArray(source.responses) ? source.responses : [];
      return {
        format: 'ESSAY',
        responses: responses
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            if (
              typeof row.questionId !== 'string' ||
              !row.questionId.trim() ||
              typeof row.answer !== 'string' ||
              !row.answer.trim()
            ) {
              return null;
            }

            return {
              questionId: row.questionId.trim(),
              answer: row.answer.trim(),
            };
          })
          .filter((row): row is { questionId: string; answer: string } =>
            Boolean(row),
          ),
      };
    }

    if (format === 'TEXT') {
      return {
        format: 'TEXT',
        text: typeof source.text === 'string' ? source.text.trim() : '',
        attachments: Array.isArray(source.attachments)
          ? source.attachments.filter(
              (item): item is string =>
                typeof item === 'string' && item.trim().length > 0,
            )
          : undefined,
      };
    }

    return {
      format: 'GENERIC',
      payload: source,
    };
  }

  private normalizeSubmissionAttachments(
    input: SubmitAssignmentInput,
  ): NormalizedSubmissionAttachment[] {
    const seen = new Set<string>();
    const result: NormalizedSubmissionAttachment[] = [];

    const fromBody = Array.isArray(input.attachments) ? input.attachments : [];
    for (const row of fromBody) {
      const key = row.fileUrl.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({
        fileUrl: key,
        fileName: row.fileName?.trim() || undefined,
        fileMimeType: row.fileMimeType?.trim() || undefined,
      });
    }

    if (input.answers.format === 'TEXT' && Array.isArray(input.answers.attachments)) {
      for (const legacyUrl of input.answers.attachments) {
        const key = legacyUrl.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push({ fileUrl: key });
      }
    }

    return result;
  }

  private assertAnswersMatchAssignmentType(
    assignmentType: AssignmentType,
    content: NormalizedAssignmentContent,
    answers: NormalizedSubmitAnswers,
  ) {
    if (assignmentType === 'QUIZ_MCQ') {
      if (answers.format !== 'MCQ') {
        throw new BadRequestException(
          'QUIZ_MCQ submission must use answers.format = "MCQ"',
        );
      }

      if (answers.responses.length === 0) {
        throw new BadRequestException(
          'MCQ submission responses cannot be empty',
        );
      }

      const allowedQuestionIds = new Set(
        content.questionSet.mcq.map((q) => q.id),
      );
      const invalidQuestionIds = answers.responses
        .map((row) => row.questionId)
        .filter((questionId) => !allowedQuestionIds.has(questionId));

      if (invalidQuestionIds.length > 0) {
        throw new BadRequestException(
          'MCQ submission contains unknown questionId',
        );
      }
    }

    if (assignmentType === 'QUIZ_ESSAY') {
      if (answers.format !== 'ESSAY') {
        throw new BadRequestException(
          'QUIZ_ESSAY submission must use answers.format = "ESSAY"',
        );
      }

      if (answers.responses.length === 0) {
        throw new BadRequestException(
          'Essay submission responses cannot be empty',
        );
      }

      const allowedQuestionIds = new Set(
        content.questionSet.essay.map((q) => q.id),
      );
      const invalidQuestionIds = answers.responses
        .map((row) => row.questionId)
        .filter((questionId) => !allowedQuestionIds.has(questionId));

      if (invalidQuestionIds.length > 0) {
        throw new BadRequestException(
          'Essay submission contains unknown questionId',
        );
      }
    }

    if (assignmentType === 'TASK' || assignmentType === 'REMEDIAL') {
      if (answers.format === 'GENERIC') {
        return;
      }

      if (
        answers.format === 'TEXT' &&
        !answers.text &&
        (!answers.attachments || answers.attachments.length === 0)
      ) {
        throw new BadRequestException(
          'Task/remedial submission requires text or attachments',
        );
      }
    }
  }

  private tryAutoGradeMcqSubmission({
    assignmentType,
    assignmentMaxScore,
    content,
    answers,
  }: {
    assignmentType: AssignmentType;
    assignmentMaxScore: number;
    content: NormalizedAssignmentContent;
    answers: NormalizedSubmitAnswers;
  }): {
    status: SubmissionStatus;
    score: number;
    feedback: string;
    gradedAt: Date;
  } | null {
    if (assignmentType !== 'QUIZ_MCQ') {
      return null;
    }

    if (answers.format !== 'MCQ') {
      return null;
    }

    const answerMap = new Map(
      answers.responses.map((response) => [
        response.questionId,
        response.answer,
      ]),
    );

    let score = 0;
    let correctCount = 0;
    for (const question of content.questionSet.mcq) {
      const answer = answerMap.get(question.id);
      if (!answer) continue;
      if (answer === question.correctOption) {
        score += question.points;
        correctCount += 1;
      }
    }

    score = Math.min(score, assignmentMaxScore);

    return {
      status: SubmissionStatus.GRADED,
      score,
      feedback: `Auto-graded MCQ: ${correctCount}/${content.questionSet.mcq.length} correct`,
      gradedAt: new Date(),
    };
  }

  private buildAutoMcqQuestionGrades({
    assignmentType,
    content,
    answers,
  }: {
    assignmentType: AssignmentType;
    content: NormalizedAssignmentContent;
    answers: NormalizedSubmitAnswers;
  }): Array<{
    questionId: string;
    questionType: AssignmentQuestionType;
    score: number;
    maxScore: number;
    isCorrect: boolean;
    feedback?: string;
  }> {
    if (assignmentType !== 'QUIZ_MCQ' || answers.format !== 'MCQ') {
      return [];
    }

    const answerMap = new Map(
      answers.responses.map((response) => [response.questionId, response.answer]),
    );

    return content.questionSet.mcq.map((question) => {
      const picked = answerMap.get(question.id);
      const isCorrect = !!picked && picked === question.correctOption;
      return {
        questionId: question.id,
        questionType: AssignmentQuestionType.MCQ,
        score: isCorrect ? question.points : 0,
        maxScore: question.points,
        isCorrect,
        feedback: isCorrect
          ? 'Correct answer'
          : picked
            ? `Incorrect. Correct option: ${question.correctOption}`
            : 'No answer submitted',
      };
    });
  }
}
