import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AssignmentStatus,
  AssignmentType,
  SubmissionStatus,
  UserRole,
} from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssignmentsService } from './assignments.service';
import {
  createAssignmentSchema,
  gradeSubmissionSchema,
  publishAssignmentSchema,
  queryAssignmentsSchema,
  queryGradebookSchema,
  querySubmissionsSchema,
  submitAssignmentSchema,
  updateAssignmentSchema,
} from './assignments.schemas';

@Controller({ path: 'assignments', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Assignments')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List assignments (timeline)' })
  @ApiQuery({
    name: 'classId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({ name: 'type', required: false, enum: AssignmentType })
  @ApiQuery({ name: 'status', required: false, enum: AssignmentStatus })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'quiz aljabar' })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'publishedAt', 'dueAt', 'title'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listAssignments(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(queryAssignmentsSchema)) query: unknown,
  ) {
    return this.assignmentsService.listAssignments(user, query as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assignment detail' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.assignmentsService.getAssignmentById(user, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Create assignment/task in class timeline' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId', 'title', 'type'],
      properties: {
        classId: { type: 'string', format: 'uuid' },
        materialId: { type: 'string', format: 'uuid' },
        title: { type: 'string', example: 'Quiz Bab 1 Aljabar' },
        description: {
          type: 'string',
          example: 'Kerjakan sebelum pertemuan berikutnya.',
        },
        type: {
          type: 'string',
          enum: Object.values(AssignmentType),
          example: AssignmentType.QUIZ_MCQ,
        },
        content: { type: 'object', additionalProperties: true },
        passingScore: { type: 'number', example: 70 },
        maxScore: { type: 'number', example: 100 },
        dueAt: { type: 'string', format: 'date-time' },
        status: {
          type: 'string',
          enum: Object.values(AssignmentStatus),
          example: AssignmentStatus.DRAFT,
        },
      },
    },
  })
  createAssignment(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAssignmentSchema)) body: unknown,
  ) {
    return this.assignmentsService.createAssignment(user, body as any);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update assignment/task' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  updateAssignment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) body: unknown,
  ) {
    return this.assignmentsService.updateAssignment(user, id, body as any);
  }

  @Patch(':id/publish')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Publish or unpublish assignment in timeline' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        published: { type: 'boolean', example: true },
        publishedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  publishAssignment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(publishAssignmentSchema)) body: unknown,
  ) {
    return this.assignmentsService.publishAssignment(user, id, body as any);
  }

  @Post(':id/submit')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Submit assignment answers (student)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['answers'],
      properties: {
        answers: {
          oneOf: [
            {
              type: 'object',
              properties: {
                responses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      questionId: { type: 'string', example: 'q1' },
                      answer: { type: 'string', example: 'B' },
                    },
                  },
                },
              },
            },
            {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            { type: 'string', example: 'Jawaban essay saya...' },
          ],
        },
      },
    },
  })
  submit(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(submitAssignmentSchema)) body: unknown,
  ) {
    return this.assignmentsService.submitAssignment(user, id, body as any);
  }

  @Get(':id/submissions')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List submissions for an assignment' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({ name: 'status', required: false, enum: SubmissionStatus })
  @ApiQuery({
    name: 'studentId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['submittedAt', 'gradedAt', 'score'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listSubmissions(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Query(new ZodValidationPipe(querySubmissionsSchema)) query: unknown,
  ) {
    return this.assignmentsService.listSubmissions(
      user,
      assignmentId,
      query as any,
    );
  }

  @Patch('submissions/:submissionId/grade')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Grade a submission' })
  @ApiParam({
    name: 'submissionId',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['score'],
      properties: {
        score: { type: 'number', example: 85 },
        feedback: {
          type: 'string',
          example: 'Good work, improve step 3 explanation.',
        },
        status: {
          type: 'string',
          enum: Object.values(SubmissionStatus),
          example: SubmissionStatus.GRADED,
        },
      },
    },
  })
  gradeSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('submissionId', new ParseUUIDPipe({ version: '4' }))
    submissionId: string,
    @Body(new ZodValidationPipe(gradeSubmissionSchema)) body: unknown,
  ) {
    return this.assignmentsService.gradeSubmission(
      user,
      submissionId,
      body as any,
    );
  }

  @Get('classes/:classId/gradebook')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Get class grade recap' })
  @ApiParam({
    name: 'classId',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'student' })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['fullName', 'email', 'avgScore', 'submissionRate'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  getGradebook(
    @CurrentUser() user: JwtPayload,
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @Query(new ZodValidationPipe(queryGradebookSchema)) query: unknown,
  ) {
    return this.assignmentsService.getClassGradebook(
      user,
      classId,
      query as any,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Delete assignment' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deleteAssignment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.assignmentsService.deleteAssignment(user, id);
  }
}
