import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlogsAdminController } from './blogs-admin.controller';
import { BlogsPublicController } from './blogs-public.controller';
import { BlogsService } from './blogs.service';

@Module({
  controllers: [BlogsPublicController, BlogsAdminController],
  providers: [BlogsService, RolesGuard],
})
export class BlogsModule {}
