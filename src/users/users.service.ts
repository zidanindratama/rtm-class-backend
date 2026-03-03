import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { buildListMeta, clampSortOrder } from '../common/utils/list-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserAdminInput,
  QueryUsersInput,
  UpdateUserAdminInput,
} from './users.schemas';

const SALT_ROUNDS = 10;
const MANAGED_ROLES: UserRole[] = [UserRole.TEACHER, UserRole.STUDENT];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: QueryUsersInput) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isSuspended: query.isSuspended,
      OR: query.search
        ? [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [totalItems, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
        },
        orderBy: {
          [query.sort_by]: clampSortOrder(query.sort_order),
        },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
      }),
    ]);

    return {
      message: 'Users fetched',
      data: users.map((user) => this.serializeUser(user)),
      meta: buildListMeta(totalItems, query.page, query.per_page),
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'User fetched',
      data: this.serializeUser(user),
    };
  }

  async createUser(dto: CreateUserAdminInput) {
    if (!MANAGED_ROLES.includes(dto.role)) {
      throw new BadRequestException('Admin can only create teacher or student accounts');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
        isSuspended: dto.isSuspended ?? false,
        profile: {
          create: {
            address: dto.address,
            phoneNumber: dto.phoneNumber,
            pictureUrl: dto.pictureUrl,
          },
        },
      },
      include: { profile: true },
    });

    return {
      message: 'User created',
      data: this.serializeUser(user),
    };
  }

  async updateUser(id: string, dto: UpdateUserAdminInput) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email) {
      const emailInUse = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (emailInUse) {
        throw new ConflictException('Email already registered');
      }
    }

    if (dto.role && !MANAGED_ROLES.includes(dto.role)) {
      throw new BadRequestException('Admin module only manages teacher and student accounts');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email: dto.email?.toLowerCase(),
        passwordHash,
        role: dto.role,
        isSuspended: dto.isSuspended,
        profile: {
          upsert: {
            create: {
              address: dto.address,
              phoneNumber: dto.phoneNumber,
              pictureUrl: dto.pictureUrl,
            },
            update: {
              address: dto.address,
              phoneNumber: dto.phoneNumber,
              pictureUrl: dto.pictureUrl,
            },
          },
        },
      },
      include: { profile: true },
    });

    return {
      message: 'User updated',
      data: this.serializeUser(user),
    };
  }

  async setSuspendStatus(id: string, suspended: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isSuspended: suspended },
      include: { profile: true },
    });

    return {
      message: suspended ? 'User suspended' : 'User unsuspended',
      data: this.serializeUser(updated),
    };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });

    return {
      message: 'User deleted',
      data: null,
    };
  }

  private serializeUser(user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    isSuspended: boolean;
    createdAt: Date;
    updatedAt: Date;
    profile?: {
      id: string;
      address: string | null;
      phoneNumber: string | null;
      pictureUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isSuspended: user.isSuspended,
      profile: user.profile
        ? {
            id: user.profile.id,
            address: user.profile.address,
            phoneNumber: user.profile.phoneNumber,
            pictureUrl: user.profile.pictureUrl,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
