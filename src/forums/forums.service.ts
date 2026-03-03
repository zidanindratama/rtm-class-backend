import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '../auth/types';
import { ClassesService } from '../classes/classes.service';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateForumCommentInput,
  CreateForumThreadInput,
  ListForumThreadsInput,
} from './forums.schemas';

@Injectable()
export class ForumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
  ) {}

  async listThreads(user: JwtPayload, query: ListForumThreadsInput) {
    await this.classesService.assertClassAccess(user, query.classId);

    const where = {
      classroomId: query.classId,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' as const } },
            { content: { contains: query.search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };

    const [totalItems, threads] = await this.prisma.$transaction([
      this.prisma.forumThread.count({ where }),
      this.prisma.forumThread.findMany({
        where,
        include: {
          author: {
            select: { id: true, fullName: true, email: true },
          },
          _count: {
            select: { comments: true, upvotes: true },
          },
        },
        orderBy: {
          [query.sort_by]: clampSortOrder(query.sort_order),
        },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      }),
    ]);

    return {
      message: 'Forum threads fetched',
      data: threads,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async getThreadById(user: JwtPayload, threadId: string) {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
        classroom: {
          select: { id: true, name: true, classCode: true },
        },
        upvotes: {
          select: { userId: true },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.classesService.assertClassAccess(user, thread.classroomId);

    const comments = await this.prisma.forumComment.findMany({
      where: { threadId },
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
        upvotes: {
          select: { userId: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const nodeMap = new Map<string, any>();
    for (const comment of comments) {
      nodeMap.set(comment.id, {
        ...comment,
        upvoteCount: comment.upvotes.length,
        upvotedByMe: comment.upvotes.some((vote) => vote.userId === user.sub),
        replies: [],
      });
    }

    const roots: any[] = [];
    for (const comment of comments) {
      const node = nodeMap.get(comment.id);
      if (comment.parentId && nodeMap.has(comment.parentId)) {
        nodeMap.get(comment.parentId).replies.push(node);
      } else {
        roots.push(node);
      }
    }

    return {
      message: 'Forum thread fetched',
      data: {
        ...thread,
        upvoteCount: thread.upvotes.length,
        upvotedByMe: thread.upvotes.some((vote) => vote.userId === user.sub),
        comments: roots,
      },
    };
  }

  async createThread(user: JwtPayload, input: CreateForumThreadInput) {
    await this.classesService.assertClassAccess(user, input.classId);

    const thread = await this.prisma.forumThread.create({
      data: {
        classroomId: input.classId,
        authorId: user.sub,
        title: input.title,
        content: input.content,
      },
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Forum thread created',
      data: thread,
    };
  }

  async createComment(
    user: JwtPayload,
    threadId: string,
    parentId: string | null,
    input: CreateForumCommentInput,
  ) {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.classesService.assertClassAccess(user, thread.classroomId);

    if (parentId) {
      const parent = await this.prisma.forumComment.findUnique({
        where: { id: parentId },
        select: { id: true, threadId: true },
      });
      if (!parent || parent.threadId !== threadId) {
        throw new NotFoundException('Parent comment not found in this thread');
      }
    }

    const comment = await this.prisma.forumComment.create({
      data: {
        threadId,
        authorId: user.sub,
        parentId,
        content: input.content,
      },
      include: {
        author: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: parentId ? 'Reply created' : 'Comment created',
      data: comment,
    };
  }

  async replyToComment(user: JwtPayload, commentId: string, input: CreateForumCommentInput) {
    const parentComment = await this.prisma.forumComment.findUnique({
      where: { id: commentId },
      select: { id: true, threadId: true },
    });

    if (!parentComment) {
      throw new NotFoundException('Comment not found');
    }

    return this.createComment(user, parentComment.threadId, parentComment.id, input);
  }

  async toggleThreadUpvote(user: JwtPayload, threadId: string) {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      select: { id: true, classroomId: true },
    });

    if (!thread) {
      throw new NotFoundException('Thread not found');
    }

    await this.classesService.assertClassAccess(user, thread.classroomId);

    const existing = await this.prisma.forumThreadUpvote.findUnique({
      where: { threadId_userId: { threadId, userId: user.sub } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.forumThreadUpvote.delete({ where: { id: existing.id } });
      return { message: 'Thread upvote removed', data: { upvoted: false } };
    }

    await this.prisma.forumThreadUpvote.create({
      data: { threadId, userId: user.sub },
    });

    return { message: 'Thread upvoted', data: { upvoted: true } };
  }

  async toggleCommentUpvote(user: JwtPayload, commentId: string) {
    const comment = await this.prisma.forumComment.findUnique({
      where: { id: commentId },
      include: { thread: { select: { classroomId: true } } },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.classesService.assertClassAccess(user, comment.thread.classroomId);

    const existing = await this.prisma.forumCommentUpvote.findUnique({
      where: { commentId_userId: { commentId, userId: user.sub } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.forumCommentUpvote.delete({ where: { id: existing.id } });
      return { message: 'Comment upvote removed', data: { upvoted: false } };
    }

    await this.prisma.forumCommentUpvote.create({
      data: { commentId, userId: user.sub },
    });

    return { message: 'Comment upvoted', data: { upvoted: true } };
  }
}
