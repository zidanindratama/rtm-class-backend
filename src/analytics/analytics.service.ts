import { ForbiddenException, Injectable } from '@nestjs/common';
import { AssignmentStatus, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassAnalyticsQueryInput } from './analytics.schemas';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
  ) {}

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
