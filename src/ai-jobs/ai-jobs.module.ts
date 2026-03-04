import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { AiJobsController } from './ai-jobs.controller';
import { AiJobsService } from './ai-jobs.service';

@Module({
  imports: [ClassesModule],
  controllers: [AiJobsController],
  providers: [AiJobsService],
  exports: [AiJobsService],
})
export class AiJobsModule {}
