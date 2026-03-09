import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  ParseUUIDPipe,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createClassSchema,
  joinClassSchema,
  queryClassMembersSchema,
  queryClassesSchema,
  updateClassSchema,
} from './classes.schemas';
import { ClassesService } from './classes.service';

@Controller({ path: 'classes', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiTags('Classes')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({ summary: 'List classes accessible by current user' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'Class X' })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'name', 'classCode'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listClasses(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(queryClassesSchema)) query: unknown,
  ) {
    return this.classesService.listClasses(user, query as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get class detail by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getClassById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.classesService.getClassById(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create class' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Mathematics 10-A' },
        institutionName: { type: 'string', example: 'SMA Negeri 1 Jakarta' },
        classLevel: { type: 'string', example: 'Grade 10' },
        academicYear: { type: 'string', example: '2026/2027' },
        description: {
          type: 'string',
          example: 'Basic algebra and geometry class.',
        },
      },
    },
  })
  createClass(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createClassSchema)) body: unknown,
  ) {
    return this.classesService.createClass(user, body as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete class (owner/admin)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deleteClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.classesService.deleteClass(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update class' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Mathematics 10-B' },
        institutionName: { type: 'string', example: 'SMA Negeri 1 Jakarta' },
        classLevel: { type: 'string', example: 'Grade 10' },
        academicYear: { type: 'string', example: '2026/2027' },
        description: {
          type: 'string',
          example: 'Updated class description.',
        },
      },
    },
  })
  updateClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) body: unknown,
  ) {
    return this.classesService.updateClass(user, id, body as any);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join class by code' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classCode'],
      properties: {
        classCode: { type: 'string', example: 'AB12CD34' },
      },
    },
  })
  joinClass(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(joinClassSchema)) body: unknown,
  ) {
    return this.classesService.joinClassByCode(user, body as any);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave class (student only)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  leaveClass(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.classesService.leaveClass(user, id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List class members' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'student' })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'fullName', 'email'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listClassMembers(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new ZodValidationPipe(queryClassMembersSchema)) query: unknown,
  ) {
    return this.classesService.listClassMembers(user, id, query as any);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove class member (owner/admin)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'userId',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  removeClassMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.classesService.removeClassMember(user, id, userId);
  }
}
