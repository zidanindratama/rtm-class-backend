import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createBlogCommentSchema, queryBlogCommentsSchema, queryBlogsSchema } from './blogs.schemas';
import { BlogsService } from './blogs.service';

@Controller({ path: 'blogs', version: '1' })
@ApiTags('Blogs (Public)')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
export class BlogsPublicController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  @ApiOperation({ summary: 'List published blogs' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'education' })
  @ApiQuery({
    name: 'sort_by',
    required: false,
    enum: ['createdAt', 'publishedAt', 'title'],
  })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listPublished(@Query(new ZodValidationPipe(queryBlogsSchema)) query: unknown) {
    return this.blogsService.listPublishedPosts(query as any);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get published blog by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.blogsService.getPublishedPostBySlug(slug);
  }

  @Get(':slug/comments')
  @ApiOperation({ summary: 'List comments for published blog' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listComments(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(queryBlogCommentsSchema)) query: unknown,
  ) {
    return this.blogsService.listCommentsBySlug(slug, query as any);
  }

  @Post(':slug/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create comment on published blog' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', example: 'Great article, very helpful.' },
      },
    },
  })
  createComment(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createBlogCommentSchema)) body: unknown,
  ) {
    return this.blogsService.createComment(user, slug, body as any, null);
  }

  @Post('comments/:commentId/replies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reply to blog comment' })
  @ApiParam({
    name: 'commentId',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', example: 'I agree with this point.' },
      },
    },
  })
  replyComment(
    @CurrentUser() user: JwtPayload,
    @Param('commentId', new ParseUUIDPipe({ version: '4' })) commentId: string,
    @Body(new ZodValidationPipe(createBlogCommentSchema)) body: unknown,
  ) {
    return this.blogsService.replyToComment(user, commentId, body as any);
  }
}
