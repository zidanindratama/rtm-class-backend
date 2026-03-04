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
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createBlogSchema,
  queryBlogsSchema,
  updateBlogSchema,
} from './blogs.schemas';
import { BlogsService } from './blogs.service';

@Controller({ path: 'admin/blogs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Blogs (Admin)')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class BlogsAdminController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  @ApiOperation({ summary: 'List all blogs (admin)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'math' })
  @ApiQuery({ name: 'isPublished', required: false, example: true })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'publishedAt', 'title'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listPosts(@Query(new ZodValidationPipe(queryBlogsSchema)) query: unknown) {
    return this.blogsService.adminListPosts(query as any);
  }

  @Post()
  @ApiOperation({ summary: 'Create blog post' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'content'],
      properties: {
        title: { type: 'string', example: 'How AI helps classroom' },
        slug: { type: 'string', example: 'how-ai-helps-classroom' },
        excerpt: { type: 'string', example: 'Short summary for landing page' },
        content: { type: 'string', example: 'Full article markdown or html content...' },
        isPublished: { type: 'boolean', example: true },
      },
    },
  })
  createPost(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createBlogSchema)) dto: unknown,
  ) {
    return this.blogsService.createPost(user.sub, dto as any);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update blog post' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Updated title' },
        slug: { type: 'string', example: 'updated-slug' },
        excerpt: { type: 'string', example: 'Updated excerpt' },
        content: { type: 'string', example: 'Updated full content...' },
        isPublished: { type: 'boolean', example: false },
      },
    },
  })
  updatePost(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateBlogSchema)) dto: unknown,
  ) {
    return this.blogsService.updatePost(id, dto as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete blog post' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deletePost(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.blogsService.deletePost(id);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete blog comment (admin)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.blogsService.deleteCommentByAdmin(user, id);
  }
}
