import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClassesModule } from '../classes/classes.module';
import { RedisModule } from '../redis/redis.module';
import { AiJobsController } from './ai-jobs.controller';
import { AiJobsService } from './ai-jobs.service';

@Module({
  imports: [ClassesModule, RedisModule, HttpModule],
  controllers: [AiJobsController],
  providers: [AiJobsService],
  exports: [AiJobsService],
})
export class AiJobsModule {}
