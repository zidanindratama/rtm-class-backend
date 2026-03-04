import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClassesModule } from '../classes/classes.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ClassesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RolesGuard],
})
export class AnalyticsModule {}
