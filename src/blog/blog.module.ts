import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlogAdminController } from './blog-admin.controller';
import { BlogPublicController } from './blog-public.controller';
import { BlogService } from './blog.service';

@Module({
  controllers: [BlogPublicController, BlogAdminController],
  providers: [BlogService, RolesGuard],
})
export class BlogModule {}
