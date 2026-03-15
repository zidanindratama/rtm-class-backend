import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  ClassroomMemberRole,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClassAnalyticsQueryInput,
  DashboardAnalyticsQueryInput,
} from './analytics.schemas';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
  ) {}

  async getDashboardOverview(
    user: JwtPayload,
    query: DashboardAnalyticsQueryInput,
  ) {
    const classrooms = await this.getScopedClassrooms(user);
    const classIds = classrooms.map((classroom) => classroom.id);

    if (classIds.length === 0) {
      return {
        message: 'Dashboard analytics fetched',
        data: this.buildEmptyDashboardModel(user.role, query.weeks),
      };
    }

    const [publishedAssignments, submissions, classroomMembers] =
      await Promise.all([
        this.prisma.assignment.findMany({
          where: {
            classroomId: { in: classIds },
            status: AssignmentStatus.PUBLISHED,
          },
          select: {
            id: true,
            classroomId: true,
            dueAt: true,
          },
        }),
        this.prisma.assignmentSubmission.findMany({
          where: {
            assignment: {
              classroomId: { in: classIds },
              status: AssignmentStatus.PUBLISHED,
            },
            ...(user.role === UserRole.STUDENT ? { studentId: user.sub } : {}),
          },
          select: {
            id: true,
            studentId: true,
            score: true,
            submittedAt: true,
            gradedAt: true,
            assignment: {
              select: {
                id: true,
                title: true,
                classroomId: true,
                dueAt: true,
              },
            },
          },
        }),
        this.prisma.classroomMember.findMany({
          where: {
            classroomId: { in: classIds },
            role: ClassroomMemberRole.STUDENT,
          },
          select: {
            classroomId: true,
            userId: true,
          },
        }),
      ]);

    const classNameMap = new Map(
      classrooms.map((classroom) => [classroom.id, classroom.name]),
    );

    const assignmentByClass = new Map<string, number>();
    for (const assignment of publishedAssignments) {
      assignmentByClass.set(
        assignment.classroomId,
        (assignmentByClass.get(assignment.classroomId) ?? 0) + 1,
      );
    }

    const studentCountByClass = new Map<string, number>();
    if (user.role === UserRole.STUDENT) {
      for (const classroom of classrooms) {
        studentCountByClass.set(classroom.id, 1);
      }
    } else {
      for (const member of classroomMembers) {
        studentCountByClass.set(
          member.classroomId,
          (studentCountByClass.get(member.classroomId) ?? 0) + 1,
        );
      }
    }

    const totalStudents =
      user.role === UserRole.STUDENT
        ? 1
        : new Set(classroomMembers.map((member) => member.userId)).size;

    const totalAssignments = publishedAssignments.length;
    const totalExpectedSubmissions =
      user.role === UserRole.STUDENT
        ? totalAssignments
        : classIds.reduce((sum, classId) => {
            const assignments = assignmentByClass.get(classId) ?? 0;
            const students = studentCountByClass.get(classId) ?? 0;
            return sum + assignments * students;
          }, 0);

    const totalSubmissions = submissions.length;
    const gradedSubmissions = submissions.filter(
      (submission) => typeof submission.score === 'number',
    );
    const averageScore = this.round1(
      gradedSubmissions.length > 0
        ? gradedSubmissions.reduce(
            (sum, submission) => sum + (submission.score ?? 0),
            0,
          ) / gradedSubmissions.length
        : 0,
    );

    let onTimeCount = 0;
    let lateCount = 0;
    for (const submission of submissions) {
      const dueAt = submission.assignment.dueAt;
      if (!dueAt || submission.submittedAt <= dueAt) {
        onTimeCount += 1;
      } else {
        lateCount += 1;
      }
    }

    const missingCount = Math.max(totalExpectedSubmissions - totalSubmissions, 0);
    const completionRate = this.toPercent(totalSubmissions, totalExpectedSubmissions);

    const perClassRows = classIds.map((classId) => {
      const classSubmissions = submissions.filter(
        (submission) => submission.assignment.classroomId === classId,
      );
      const classGraded = classSubmissions.filter(
        (submission) => typeof submission.score === 'number',
      );
      const classAvg = this.round1(
        classGraded.length > 0
          ? classGraded.reduce((sum, submission) => sum + (submission.score ?? 0), 0) /
              classGraded.length
          : 0,
      );

      const expected =
        (assignmentByClass.get(classId) ?? 0) * (studentCountByClass.get(classId) ?? 0);

      return {
        classId,
        className: classNameMap.get(classId) ?? 'Unnamed class',
        avgScore: classAvg,
        completionRate: this.toPercent(classSubmissions.length, expected),
      };
    });

    const rankedClasses = [...perClassRows]
      .sort((first, second) => second.avgScore - first.avgScore)
      .slice(0, 5);

    const scoreTrend = this.buildScoreTrend(gradedSubmissions, query.weeks);

    const stats = this.buildRoleStats(user.role, {
      classCount: classIds.length,
      totalStudents,
      totalAssignments,
      totalSubmissions,
      completionRate,
      averageScore,
    });

    const modelCopy = this.getRoleModelCopy(user.role);

    return {
      message: 'Dashboard analytics fetched',
      data: {
        role: user.role,
        title: modelCopy.title,
        description: modelCopy.description,
        stats,
        scoreTrend,
        topClasses: rankedClasses.map((row) => ({
          className: row.className,
          score: row.avgScore,
        })),
        submissionStatus: [
          { name: 'On Time', value: onTimeCount, fill: 'var(--color-chart-1)' },
          { name: 'Late', value: lateCount, fill: 'var(--color-chart-2)' },
          { name: 'Missing', value: missingCount, fill: 'var(--color-chart-3)' },
        ],
        topChartTitle: modelCopy.topChartTitle,
        topChartDescription: modelCopy.topChartDescription,
        rankingTitle: modelCopy.rankingTitle,
        rankingRows: rankedClasses.map((row) => ({
          name: row.className,
          score: row.avgScore,
          completionRate: `${row.completionRate}%`,
        })),
        meta: {
          weeks: query.weeks,
          totalClasses: classIds.length,
          totalAssignments,
          totalSubmissions,
        },
      },
    };
  }

  async getClassDashboard(
    user: JwtPayload,
    classId: string,
    query: ClassAnalyticsQueryInput,
  ) {
    await this.classesService.assertClassAccess(user, classId);

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER) {
      throw new ForbiddenException(
        'Only admin or teacher can access analytics',
      );
    }

    const [classroom, students, publishedAssignments] = await Promise.all([
      this.prisma.classroom.findUnique({
        where: { id: classId },
        select: { id: true, name: true, classCode: true },
      }),
      this.prisma.classroomMember.findMany({
        where: {
          classroomId: classId,
          user: { role: UserRole.STUDENT },
        },
        include: {
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.assignment.findMany({
        where: {
          classroomId: classId,
          status: AssignmentStatus.PUBLISHED,
        },
        select: {
          id: true,
          title: true,
          type: true,
          passingScore: true,
          maxScore: true,
          content: true,
          publishedAt: true,
        },
      }),
    ]);

    if (!classroom) {
      return {
        message: 'Class analytics fetched',
        data: null,
      };
    }

    const assignmentIds = publishedAssignments.map((row) => row.id);

    const submissions =
      assignmentIds.length === 0
        ? []
        : await this.prisma.assignmentSubmission.findMany({
            where: {
              assignmentId: { in: assignmentIds },
            },
            select: {
              id: true,
              assignmentId: true,
              studentId: true,
              score: true,
              answers: true,
            },
          });

    const totalStudents = students.length;
    const totalPublishedAssignments = publishedAssignments.length;
    const totalExpectedSubmissions = totalStudents * totalPublishedAssignments;
    const totalSubmissions = submissions.length;

    const gradedSubmissions = submissions.filter(
      (row) => typeof row.score === 'number',
    );
    const averageScore =
      gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum, row) => sum + (row.score ?? 0), 0) /
          gradedSubmissions.length
        : null;

    const passThreshold = query.passingScore;
    const passCount = gradedSubmissions.filter(
      (row) => (row.score ?? 0) >= passThreshold,
    ).length;
    const passRate =
      gradedSubmissions.length > 0
        ? Number(((passCount / gradedSubmissions.length) * 100).toFixed(2))
        : 0;

    const assignmentToStudentSet = new Map<string, Set<string>>();
    for (const submission of submissions) {
      const set =
        assignmentToStudentSet.get(submission.assignmentId) ??
        new Set<string>();
      set.add(submission.studentId);
      assignmentToStudentSet.set(submission.assignmentId, set);
    }

    const missingByAssignment = publishedAssignments.map((assignment) => {
      const submittedSet =
        assignmentToStudentSet.get(assignment.id) ?? new Set<string>();
      const missingStudents = students
        .filter((member) => !submittedSet.has(member.user.id))
        .map((member) => ({
          id: member.user.id,
          fullName: member.user.fullName,
          email: member.user.email,
        }));

      return {
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        missingCount: missingStudents.length,
        missingStudents,
      };
    });

    const hardestQuestions = this.computeHardestQuestions(
      publishedAssignments,
      submissions,
    );

    return {
      message: 'Class analytics fetched',
      data: {
        class: classroom,
        overview: {
          totalStudents,
          totalPublishedAssignments,
          totalSubmissions,
          completionRate:
            totalExpectedSubmissions > 0
              ? Number(
                  ((totalSubmissions / totalExpectedSubmissions) * 100).toFixed(
                    2,
                  ),
                )
              : 0,
          averageScore,
          passRate,
        },
        studentsNotSubmitted: missingByAssignment,
        hardestQuestions,
      },
    };
  }

  private async getScopedClassrooms(user: JwtPayload) {
    if (user.role === UserRole.ADMIN) {
      return this.prisma.classroom.findMany({
        select: { id: true, name: true },
      });
    }

    if (user.role === UserRole.TEACHER) {
      return this.prisma.classroom.findMany({
        where: { teacherId: user.sub },
        select: { id: true, name: true },
      });
    }

    return this.prisma.classroom.findMany({
      where: {
        members: {
          some: {
            userId: user.sub,
            role: ClassroomMemberRole.STUDENT,
          },
        },
      },
      select: { id: true, name: true },
    });
  }

  private buildScoreTrend(
    gradedSubmissions: Array<{ score: number | null; gradedAt: Date | null; submittedAt: Date }>,
    weeks: number,
  ) {
    const now = new Date();
    const start = this.startOfDay(new Date(now.getTime() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000));
    const buckets = Array.from({ length: weeks }, (_, index) => ({
      week: `W${index + 1}`,
      sum: 0,
      count: 0,
    }));

    for (const submission of gradedSubmissions) {
      const score = submission.score;
      if (typeof score !== 'number') continue;

      const date = submission.gradedAt ?? submission.submittedAt;
      if (date < start) continue;

      const diffMs = date.getTime() - start.getTime();
      const weekIndex = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      if (weekIndex < 0 || weekIndex >= weeks) continue;

      buckets[weekIndex].sum += score;
      buckets[weekIndex].count += 1;
    }

    return buckets.map((bucket) => ({
      week: bucket.week,
      averageScore:
        bucket.count > 0 ? this.round1(bucket.sum / bucket.count) : 0,
    }));
  }

  private startOfDay(input: Date) {
    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private buildRoleStats(
    role: UserRole,
    metrics: {
      classCount: number;
      totalStudents: number;
      totalAssignments: number;
      totalSubmissions: number;
      completionRate: number;
      averageScore: number;
    },
  ) {
    if (role === UserRole.ADMIN) {
      return [
        {
          label: 'Platform Average Score',
          value: metrics.averageScore.toFixed(1),
          note: 'Across all classes with graded submissions',
        },
        {
          label: 'Active Classes',
          value: String(metrics.classCount),
          note: 'Classes currently available in the platform',
        },
        {
          label: 'Submitted Assignments',
          value: String(metrics.totalSubmissions),
          note: 'Published-assignment submissions across classes',
        },
        {
          label: 'Completion Rate',
          value: `${metrics.completionRate}%`,
          note: 'Submission completion against expected workload',
        },
      ];
    }

    if (role === UserRole.TEACHER) {
      return [
        {
          label: 'Class Average Score',
          value: metrics.averageScore.toFixed(1),
          note: 'Across classes you teach with graded submissions',
        },
        {
          label: 'Classes Taught',
          value: String(metrics.classCount),
          note: 'Classes assigned to your account',
        },
        {
          label: 'Submissions Received',
          value: String(metrics.totalSubmissions),
          note: 'Submission volume from your published assignments',
        },
        {
          label: 'Completion Rate',
          value: `${metrics.completionRate}%`,
          note: 'Submission completion against expected workload',
        },
      ];
    }

    return [
      {
        label: 'Current Average Score',
        value: metrics.averageScore.toFixed(1),
        note: 'Your graded submission average',
      },
      {
        label: 'Enrolled Classes',
        value: String(metrics.classCount),
        note: 'Classes currently joined',
      },
      {
        label: 'Completed Assignments',
        value: String(metrics.totalSubmissions),
        note: 'Assignments you have submitted',
      },
      {
        label: 'Completion Rate',
        value: `${metrics.completionRate}%`,
        note: 'Your submissions compared with published assignments',
      },
    ];
  }

  private getRoleModelCopy(role: UserRole) {
    if (role === UserRole.ADMIN) {
      return {
        title: 'Admin Dashboard',
        description:
          'Monitor platform activity, user operations, and overall system performance.',
        topChartTitle: 'Top Performing Classes',
        topChartDescription:
          'Class performance ranking by average score from graded submissions.',
        rankingTitle: 'Top Performing Classes',
      };
    }

    if (role === UserRole.TEACHER) {
      return {
        title: 'Teacher Dashboard',
        description:
          'Track classroom progress, student engagement, and teaching outcomes.',
        topChartTitle: 'Top Performing Classes You Teach',
        topChartDescription:
          'Class performance ranking based on your graded submission data.',
        rankingTitle: 'Your Class Ranking by Average Score',
      };
    }

    return {
      title: 'Student Dashboard',
      description:
        'See your class activity, submission progress, and learning performance.',
      topChartTitle: 'Your Top Classes by Score',
      topChartDescription:
        'Class ranking based on your graded submissions across enrolled classes.',
      rankingTitle: 'Your Class Ranking',
    };
  }

  private buildEmptyDashboardModel(role: UserRole, weeks: number) {
    const copy = this.getRoleModelCopy(role);

    return {
      role,
      title: copy.title,
      description: copy.description,
      stats: this.buildRoleStats(role, {
        classCount: 0,
        totalStudents: 0,
        totalAssignments: 0,
        totalSubmissions: 0,
        completionRate: 0,
        averageScore: 0,
      }),
      scoreTrend: Array.from({ length: weeks }, (_, index) => ({
        week: `W${index + 1}`,
        averageScore: 0,
      })),
      topClasses: [],
      submissionStatus: [
        { name: 'On Time', value: 0, fill: 'var(--color-chart-1)' },
        { name: 'Late', value: 0, fill: 'var(--color-chart-2)' },
        { name: 'Missing', value: 0, fill: 'var(--color-chart-3)' },
      ],
      topChartTitle: copy.topChartTitle,
      topChartDescription: copy.topChartDescription,
      rankingTitle: copy.rankingTitle,
      rankingRows: [],
      meta: {
        weeks,
        totalClasses: 0,
        totalAssignments: 0,
        totalSubmissions: 0,
      },
    };
  }

  private round1(value: number) {
    return Number(value.toFixed(1));
  }

  private toPercent(numerator: number, denominator: number) {
    if (denominator <= 0) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  private computeHardestQuestions(
    assignments: Array<{
      id: string;
      title: string;
      content: unknown;
    }>,
    submissions: Array<{
      assignmentId: string;
      answers: unknown;
    }>,
  ) {
    const result: Array<{
      assignmentId: string;
      assignmentTitle: string;
      questionId: string;
      wrongRate: number;
      totalAnswers: number;
      wrongCount: number;
    }> = [];

    for (const assignment of assignments) {
      if (!assignment.content || typeof assignment.content !== 'object')
        continue;

      const questions = this.extractQuestions(assignment.content);
      if (questions.length === 0) continue;

      const relatedSubmissions = submissions.filter(
        (row) => row.assignmentId === assignment.id,
      );

      const counters = new Map<string, { total: number; wrong: number }>();
      for (const question of questions) {
        counters.set(question.id, { total: 0, wrong: 0 });
      }

      for (const submission of relatedSubmissions) {
        const responses = this.extractResponses(submission.answers);
        for (const response of responses) {
          const question = questions.find(
            (row) => row.id === response.questionId,
          );
          if (!question) continue;

          const counter = counters.get(question.id);
          if (!counter) continue;

          counter.total += 1;
          if (
            String(response.answer).trim() !==
            String(question.correctAnswer).trim()
          ) {
            counter.wrong += 1;
          }
        }
      }

      for (const question of questions) {
        const counter = counters.get(question.id);
        if (!counter || counter.total === 0) continue;

        result.push({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          questionId: question.id,
          wrongRate: Number(((counter.wrong / counter.total) * 100).toFixed(2)),
          totalAnswers: counter.total,
          wrongCount: counter.wrong,
        });
      }
    }

    return result.sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 10);
  }

  private extractQuestions(
    content: unknown,
  ): Array<{ id: string; correctAnswer: unknown }> {
    if (typeof content !== 'object' || content === null) return [];

    const direct = (content as any).questions;
    const alt = (content as any).items;
    const candidate = Array.isArray(direct)
      ? direct
      : Array.isArray(alt)
        ? alt
        : [];

    return candidate
      .map((row: any, index: number) => ({
        id: String(row?.id ?? row?.questionId ?? `q${index + 1}`),
        correctAnswer: row?.correctAnswer ?? row?.answer ?? row?.key,
      }))
      .filter(
        (row) => row.correctAnswer !== undefined && row.correctAnswer !== null,
      );
  }

  private extractResponses(
    answers: unknown,
  ): Array<{ questionId: string; answer: unknown }> {
    if (typeof answers === 'string') return [];

    if (Array.isArray(answers)) {
      return answers
        .map((row: any, index: number) => ({
          questionId: String(row?.questionId ?? row?.id ?? `q${index + 1}`),
          answer: row?.answer ?? row?.value,
        }))
        .filter((row) => row.answer !== undefined);
    }

    if (typeof answers === 'object' && answers !== null) {
      const responses = (answers as any).responses;
      if (!Array.isArray(responses)) return [];
      return responses
        .map((row: any, index: number) => ({
          questionId: String(row?.questionId ?? row?.id ?? `q${index + 1}`),
          answer: row?.answer ?? row?.value,
        }))
        .filter((row) => row.answer !== undefined);
    }

    return [];
  }
}
