import {
  Body,
  Controller,
  Get,
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
}
