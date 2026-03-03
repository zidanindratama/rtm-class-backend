import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { queryBlogsSchema } from './blogs.schemas';
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
}
