import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteClass(id: string) {
    await this.ensureExists('class', await this.prisma.classroom.findUnique({ where: { id } }));
    await this.prisma.classroom.delete({ where: { id } });
    return { message: 'Class deleted by moderation', data: null };
  }

  async deleteMaterial(id: string) {
    await this.ensureExists('material', await this.prisma.material.findUnique({ where: { id } }));
    await this.prisma.material.delete({ where: { id } });
    return { message: 'Material deleted by moderation', data: null };
  }

  async deleteForumThread(id: string) {
    await this.ensureExists(
      'forum thread',
      await this.prisma.forumThread.findUnique({ where: { id } }),
    );
    await this.prisma.forumThread.delete({ where: { id } });
    return { message: 'Forum thread deleted by moderation', data: null };
  }

  async deleteForumComment(id: string) {
    await this.ensureExists(
      'forum comment',
      await this.prisma.forumComment.findUnique({ where: { id } }),
    );
    await this.prisma.forumComment.delete({ where: { id } });
    return { message: 'Forum comment deleted by moderation', data: null };
  }

  async deleteAssignment(id: string) {
    await this.ensureExists(
      'assignment',
      await this.prisma.assignment.findUnique({ where: { id } }),
    );
    await this.prisma.assignment.delete({ where: { id } });
    return { message: 'Assignment deleted by moderation', data: null };
  }

  async deleteBlogComment(id: string) {
    await this.ensureExists(
      'blog comment',
      await this.prisma.blogComment.findUnique({ where: { id } }),
    );
    await this.prisma.blogComment.delete({ where: { id } });
    return { message: 'Blog comment deleted by moderation', data: null };
  }

  private async ensureExists(label: string, value: unknown) {
    if (!value) throw new NotFoundException(`${label} not found`);
  }
}
