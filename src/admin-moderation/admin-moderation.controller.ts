import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminModerationService } from './admin-moderation.service';

@Controller({ path: 'admin/moderation', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Moderation (Admin)')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
@ApiBearerAuth('access-token')
export class AdminModerationController {
  constructor(private readonly moderationService: AdminModerationService) {}

  @Delete('classes/:id')
  @ApiOperation({ summary: 'Delete class (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteClass(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteClass(id);
  }

  @Delete('materials/:id')
  @ApiOperation({ summary: 'Delete material (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteMaterial(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteMaterial(id);
  }

  @Delete('forums/threads/:id')
  @ApiOperation({ summary: 'Delete forum thread (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteThread(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteForumThread(id);
  }

  @Delete('forums/comments/:id')
  @ApiOperation({ summary: 'Delete forum comment (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteComment(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteForumComment(id);
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Delete assignment (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteAssignment(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteAssignment(id);
  }

  @Delete('blogs/comments/:id')
  @ApiOperation({ summary: 'Delete blog comment (admin moderation)' })
  @ApiParam({ name: 'id', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  deleteBlogComment(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.moderationService.deleteBlogComment(id);
  }
}
