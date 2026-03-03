import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createForumCommentSchema,
  createForumThreadSchema,
  listForumThreadsSchema,
} from './forums.schemas';
import { ForumsService } from './forums.service';

@Controller({ path: 'forums', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiTags('Forums')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
})
@ApiBearerAuth('access-token')
export class ForumsController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('threads')
  @ApiOperation({ summary: 'List forum threads by class' })
  @ApiQuery({ name: 'classId', required: true, example: 'clz123abc' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'per_page', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'homework' })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['createdAt', 'title'] })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  listThreads(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listForumThreadsSchema)) query: unknown,
  ) {
    return this.forumsService.listThreads(user, query as any);
  }

  @Get('threads/:threadId')
  @ApiOperation({ summary: 'Get thread detail with nested comments' })
  getThreadById(@CurrentUser() user: JwtPayload, @Param('threadId') threadId: string) {
    return this.forumsService.getThreadById(user, threadId);
  }

  @Post('threads')
  @ApiOperation({ summary: 'Create forum thread' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId', 'title', 'content'],
      properties: {
        classId: { type: 'string', example: 'clz123abc' },
        title: { type: 'string', example: 'Question about chapter 3' },
        content: { type: 'string', example: 'Can someone explain theorem 2?' },
      },
    },
  })
  createThread(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createForumThreadSchema)) body: unknown,
  ) {
    return this.forumsService.createThread(user, body as any);
  }

  @Post('threads/:threadId/comments')
  @ApiOperation({ summary: 'Create comment on thread' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', example: 'I think the answer is on slide 15.' },
      },
    },
  })
  createComment(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Body(new ZodValidationPipe(createForumCommentSchema)) body: unknown,
  ) {
    return this.forumsService.createComment(user, threadId, null, body as any);
  }

  @Post('comments/:commentId/replies')
  @ApiOperation({ summary: 'Reply to comment (nested reply)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', example: 'Thanks, that helps!' },
      },
    },
  })
  createReply(
    @CurrentUser() user: JwtPayload,
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(createForumCommentSchema)) body: unknown,
  ) {
    return this.forumsService.replyToComment(user, commentId, body as any);
  }

  @Post('threads/:threadId/upvote')
  @ApiOperation({ summary: 'Toggle thread upvote' })
  toggleThreadUpvote(@CurrentUser() user: JwtPayload, @Param('threadId') threadId: string) {
    return this.forumsService.toggleThreadUpvote(user, threadId);
  }

  @Post('comments/:commentId/upvote')
  @ApiOperation({ summary: 'Toggle comment upvote' })
  toggleCommentUpvote(
    @CurrentUser() user: JwtPayload,
    @Param('commentId') commentId: string,
  ) {
    return this.forumsService.toggleCommentUpvote(user, commentId);
  }
}
