import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';

@Module({
  controllers: [AdminModerationController],
  providers: [AdminModerationService, RolesGuard],
})
export class AdminModerationModule {}
