import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/types';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { QueryBlogPostsDto } from './dto/query-blog-posts.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Controller({ path: 'admin/blog', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BlogAdminController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  listPosts(@Query() query: QueryBlogPostsDto) {
    return this.blogService.adminListPosts(query);
  }

  @Post()
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreateBlogPostDto) {
    return this.blogService.createPost(user.sub, dto);
  }

  @Patch(':id')
  updatePost(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blogService.updatePost(id, dto);
  }

  @Delete(':id')
  deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }
}
