import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { QueryBlogPostsDto } from './dto/query-blog-posts.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublishedPosts(query: QueryBlogPostsDto) {
    const posts = await this.prisma.blogPost.findMany({
      where: {
        isPublished: true,
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { excerpt: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      message: 'Published blog posts fetched',
      data: posts,
    };
  }

  async getPublishedPostBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, isPublished: true },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    return {
      message: 'Blog post fetched',
      data: post,
    };
  }

  async adminListPosts(query: QueryBlogPostsDto) {
    const posts = await this.prisma.blogPost.findMany({
      where: {
        isPublished: query.isPublished,
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { excerpt: { contains: query.search, mode: 'insensitive' } },
              { content: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return {
      message: 'Blog posts fetched',
      data: posts,
    };
  }

  async createPost(adminId: string, dto: CreateBlogPostDto) {
    const slug = await this.ensureUniqueSlug(dto.slug ?? this.slugify(dto.title));

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content: dto.content,
        isPublished: dto.isPublished ?? false,
        publishedAt: dto.isPublished ? new Date() : null,
        authorId: adminId,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return {
      message: 'Blog post created',
      data: post,
    };
  }

  async updatePost(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Blog post not found');
    }

    let slug = existing.slug;
    if (dto.slug) {
      slug = await this.ensureUniqueSlug(dto.slug, id);
    } else if (dto.title && dto.title !== existing.title) {
      slug = await this.ensureUniqueSlug(this.slugify(dto.title), id);
    }

    const isPublished = dto.isPublished ?? existing.isPublished;

    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content: dto.content,
        isPublished,
        publishedAt: isPublished
          ? existing.publishedAt ?? new Date()
          : null,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return {
      message: 'Blog post updated',
      data: post,
    };
  }

  async deletePost(id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Blog post not found');
    }

    await this.prisma.blogPost.delete({ where: { id } });

    return {
      message: 'Blog post deleted',
      data: null,
    };
  }

  private async ensureUniqueSlug(slugInput: string, exceptId?: string) {
    let baseSlug = this.slugify(slugInput);
    if (!baseSlug) {
      baseSlug = 'post';
    }

    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
      });

      if (!existing || existing.id === exceptId) {
        return candidate;
      }

      counter += 1;
      candidate = `${baseSlug}-${counter}`;
    }
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
}
