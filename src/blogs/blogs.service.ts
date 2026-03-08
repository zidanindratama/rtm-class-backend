import {
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBlogCommentInput,
  CreateBlogInput,
  QueryBlogCommentsInput,
  QueryBlogsInput,
  UpdateBlogInput,
} from './blogs.schemas';

@Injectable()
export class BlogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublishedPosts(query: QueryBlogsInput) {
    const where: Prisma.BlogPostWhereInput = {
      isPublished: true,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { excerpt: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [totalItems, posts] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
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
      message: 'Published blog posts fetched',
      data: posts,
      meta: buildListMeta(totalItems, query.page, query.per_page),
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

  async adminListPosts(query: QueryBlogsInput) {
    const where: Prisma.BlogPostWhereInput = {
      isPublished: query.isPublished,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { excerpt: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [totalItems, posts] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
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
      message: 'Blog posts fetched',
      data: posts,
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async adminGetPostById(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
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

  async createPost(adminId: string, dto: CreateBlogInput) {
    const slug = await this.ensureUniqueSlug(
      dto.slug ?? this.slugify(dto.title),
    );

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

  async updatePost(id: string, dto: UpdateBlogInput) {
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
        publishedAt: isPublished ? (existing.publishedAt ?? new Date()) : null,
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

  async listCommentsBySlug(slug: string, query: QueryBlogCommentsInput) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, slug: true, title: true },
    });

    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    const where: Prisma.BlogCommentWhereInput = {
      postId: post.id,
      parentId: null,
    };

    const [totalItems, comments] = await this.prisma.$transaction([
      this.prisma.blogComment.count({ where }),
      this.prisma.blogComment.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
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
      message: 'Blog comments fetched',
      data: {
        post,
        comments,
      },
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async createComment(
    user: JwtPayload,
    slug: string,
    input: CreateBlogCommentInput,
    parentId: string | null,
  ) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    if (parentId) {
      const parent = await this.prisma.blogComment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true },
      });

      if (!parent || parent.postId !== post.id) {
        throw new NotFoundException(
          'Parent blog comment not found in this post',
        );
      }
    }

    const comment = await this.prisma.blogComment.create({
      data: {
        postId: post.id,
        authorId: user.sub,
        parentId,
        content: input.content,
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
      message: parentId ? 'Blog comment reply created' : 'Blog comment created',
      data: comment,
    };
  }

  async replyToComment(
    user: JwtPayload,
    commentId: string,
    input: CreateBlogCommentInput,
  ) {
    const parent = await this.prisma.blogComment.findUnique({
      where: { id: commentId },
      include: {
        post: { select: { slug: true, isPublished: true } },
      },
    });
    if (!parent || !parent.post.isPublished) {
      throw new NotFoundException('Blog comment not found');
    }

    return this.createComment(user, parent.post.slug, input, parent.id);
  }

  async deleteCommentByAdmin(user: JwtPayload, commentId: string) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can delete blog comments');
    }

    const existing = await this.prisma.blogComment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Blog comment not found');
    }

    await this.prisma.blogComment.delete({ where: { id: commentId } });

    return {
      message: 'Blog comment deleted',
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
