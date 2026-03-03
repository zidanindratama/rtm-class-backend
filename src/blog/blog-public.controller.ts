import { Controller, Get, Param, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { QueryBlogPostsDto } from './dto/query-blog-posts.dto';

@Controller({ path: 'blog', version: '1' })
export class BlogPublicController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  listPublishedPosts(@Query() query: QueryBlogPostsDto) {
    return this.blogService.listPublishedPosts(query);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublishedPostBySlug(slug);
  }
}
