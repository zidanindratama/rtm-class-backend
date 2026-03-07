import {
  Body,
  Controller,
  Delete,
  Get,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createUserAdminSchema,
  queryUsersSchema,
  suspendUserSchema,
  updateUserAdminSchema,
} from './users.schemas';
import { UsersService } from './users.service';

@Controller({ path: 'admin/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Users (Admin)')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'zidan' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['ADMIN', 'TEACHER', 'STUDENT'],
  })
  @ApiQuery({ name: 'isSuspended', required: false, example: false })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'fullName', 'email', 'role'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listUsers(@Query(new ZodValidationPipe(queryUsersSchema)) query: unknown) {
    return this.usersService.listUsers(query as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getUserById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.usersService.getUserById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create user (teacher/student)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fullName', 'email', 'password', 'role'],
      properties: {
        fullName: { type: 'string', example: 'Teacher One' },
        email: {
          type: 'string',
          format: 'email',
          example: 'teacher@rtmclass.com',
        },
        password: { type: 'string', minLength: 8, example: 'P@ssw0rd123' },
        role: {
          type: 'string',
          enum: ['TEACHER', 'STUDENT'],
          example: 'TEACHER',
        },
        isSuspended: { type: 'boolean', example: false },
        address: { type: 'string', example: 'Jakarta' },
        phoneNumber: { type: 'string', example: '+62812345678' },
        pictureUrl: { type: 'string', example: 'https://cdn.site/avatar.png' },
      },
    },
  })
  createUser(@Body(new ZodValidationPipe(createUserAdminSchema)) dto: unknown) {
    return this.usersService.createUser(dto as any);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Updated Name' },
        email: {
          type: 'string',
          format: 'email',
          example: 'updated@rtmclass.com',
        },
        password: { type: 'string', minLength: 8, example: 'NewP@ssw0rd123' },
        role: {
          type: 'string',
          enum: ['TEACHER', 'STUDENT'],
          example: 'STUDENT',
        },
        isSuspended: { type: 'boolean', example: false },
        address: { type: 'string', example: 'Bandung' },
        phoneNumber: { type: 'string', example: '+628987654321' },
        pictureUrl: {
          type: 'string',
          example: 'https://cdn.site/avatar-updated.png',
        },
      },
    },
  })
  updateUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateUserAdminSchema)) dto: unknown,
  ) {
    return this.usersService.updateUser(id, dto as any);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend / unsuspend user' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['suspended'],
      properties: {
        suspended: { type: 'boolean', example: true },
      },
    },
  })
  suspendUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(suspendUserSchema)) dto: unknown,
  ) {
    return this.usersService.setSuspendStatus(id, (dto as any).suspended);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deleteUser(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.usersService.deleteUser(id);
  }
}
