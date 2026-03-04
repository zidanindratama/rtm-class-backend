import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModerationModule } from './admin-moderation/admin-moderation.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { AiJobsModule } from './ai-jobs/ai-jobs.module';
import { BlogsModule } from './blogs/blogs.module';
import { ClassesModule } from './classes/classes.module';
import { ForumsModule } from './forums/forums.module';
import { MaterialsModule } from './materials/materials.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AuthModule,
    AdminModerationModule,
    UploadsModule,
    UsersModule,
    BlogsModule,
    ClassesModule,
    AssignmentsModule,
    AnalyticsModule,
    ForumsModule,
    MaterialsModule,
    AiJobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
