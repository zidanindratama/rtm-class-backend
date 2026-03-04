import {
  Body,
  Controller,
  Get,
  Headers,
  Query,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { aiCallbackSchema, enqueueAiTransformSchema } from './ai-jobs.schemas';
import { AiJobsService } from './ai-jobs.service';

@Controller({ path: 'ai/jobs', version: '1' })
@ApiTags('AI Jobs')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
export class AiJobsController {
  constructor(private readonly aiJobsService: AiJobsService) {}

  @Post('transform')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Queue AI transform jobs for one material' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['materialId', 'outputs'],
      properties: {
        materialId: { type: 'string', format: 'uuid' },
        outputs: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['MCQ', 'ESSAY', 'SUMMARY', 'LKPD', 'REMEDIAL', 'DISCUSSION_TOPIC'],
          },
        },
        options: {
          type: 'object',
          properties: {
            mcqCount: { type: 'number', example: 10 },
            essayCount: { type: 'number', example: 5 },
            summaryMaxWords: { type: 'number', example: 200 },
            mcpEnabled: { type: 'boolean', example: true },
            mcqEnabled: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  enqueueTransform(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(enqueueAiTransformSchema)) body: unknown,
  ) {
    return this.aiJobsService.enqueue(user, body as any);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get AI job status/detail' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  getJobById(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.aiJobsService.getJobById(user, id);
  }

  @Post(':id/callback')
  @ApiOperation({ summary: 'AI provider callback endpoint' })
  @ApiHeader({
    name: 'x-ai-callback-secret',
    required: true,
    description: 'Shared secret between RTM backend and AI provider',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  callback(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('x-ai-callback-secret') callbackSecret: string,
    @Query('callback_secret') callbackSecretQuery: string | undefined,
    @Body(new ZodValidationPipe(aiCallbackSchema)) body: unknown,
  ) {
    const expected = process.env.AI_CALLBACK_SECRET;
    const providedSecret = callbackSecret || callbackSecretQuery;
    if (!expected || providedSecret !== expected) {
      throw new UnauthorizedException('Invalid callback secret');
    }

    return this.aiJobsService.handleCallback(id, body as any);
  }
}
