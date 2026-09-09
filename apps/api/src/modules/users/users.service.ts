import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  type CreateUserInput,
  type RoleMatrix,
  type UpdateUserInput,
  type UserListFilter,
  type UserSummary,
} from '@hms/shared';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Matches auth.service.ts. The two must not drift. */
const BCRYPT_ROUNDS = 12;

type UserRow = Prisma.UserGetPayload<{
  include: {
    practitioner: { select: { id: true } };
    staffProfile: { select: { staffNo: true } };
  };
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, filter: UserListFilter): Promise<UserSummary[]> {
    const where: Prisma.UserWhereInput = { tenantId };
    if (!filter.includeInactive) where.isActive = true;
    if (filter.role) where.role = filter.role;
    if (filter.search) {
      const search = filter.search;
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.user.findMany({
      where,
      include: {
        practitioner: { select: { id: true } },
        staffProfile: { select: { staffNo: true } },
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
    return rows.map(toSummary);
  }

  async create(tenantId: string, input: CreateUserInput): Promise<UserSummary> {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: input.email },
    });
    // Say which address, because the administrator is usually typing from a
    // handwritten list and the useful answer is "you already did this one".
    if (existing) {
      throw new ConflictException(`${input.email} already has an account here`);
    }

    const created = await this.prisma.user.create({
      data: {
        tenantId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      },
      include: {
        practitioner: { select: { id: true } },
        staffProfile: { select: { staffNo: true } },
      },
    });
    return toSummary(created);
  }

  async update(
    tenantId: string,
    id: string,
    actingUserId: string,
    input: UpdateUserInput,
  ): Promise<UserSummary> {
    const user = await this.find(tenantId, id);

    // Changing your own role is how an administrator locks the hospital out of
    // its own system: demote yourself and there may be nobody left who can put
    // it back. Somebody else with the permission must do it.
    if (input.role && input.role !== user.role && id === actingUserId) {
      throw new ForbiddenException(
        'You cannot change your own role. Ask another administrator to do it.',
      );
    }
    if (input.role && input.role !== user.role) {
      await this.assertNotLastAdmin(tenantId, user, 'change the role of');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: input,
      include: {
        practitioner: { select: { id: true } },
        staffProfile: { select: { staffNo: true } },
      },
    });
    return toSummary(updated);
  }

  async setActive(
    tenantId: string,
    id: string,
    actingUserId: string,
    isActive: boolean,
  ): Promise<UserSummary> {
    const user = await this.find(tenantId, id);

    if (!isActive && id === actingUserId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    if (!isActive) await this.assertNotLastAdmin(tenantId, user, 'deactivate');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive },
      include: {
        practitioner: { select: { id: true } },
        staffProfile: { select: { staffNo: true } },
      },
    });

    // A deactivated account must not keep working until its access token
    // expires. Dropping the refresh tokens ends the session at the next
    // refresh rather than up to fifteen minutes later.
    if (!isActive) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    }
    return toSummary(updated);
  }

  async resetPassword(
    tenantId: string,
    id: string,
    password: string,
  ): Promise<void> {
    const user = await this.find(tenantId, id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    });
    // Every existing session ends. An administrator resetting a password is
    // either onboarding somebody or responding to a compromise, and in the
    // second case leaving the old sessions alive defeats the point.
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  }

  /**
   * The permission matrix as the server holds it.
   *
   * Read-only on purpose. Roles are defined in code, checked by tests that
   * assert no role can act without the read it depends on, and reviewed like
   * code. A screen that let an administrator grant `payment:reverse` to the
   * front desk at four in the afternoon would route around all of that.
   */
  matrix(): RoleMatrix {
    return {
      permissions: [...PERMISSIONS],
      roles: ROLES.map((role) => ({
        role,
        label: ROLE_LABELS[role],
        permissions: [...ROLE_PERMISSIONS[role]],
      })),
    };
  }

  private async find(tenantId: string, id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Refuse to remove the last account that can administer this hospital.
   *
   * Without this the software has a one-click way to become unusable, and the
   * only fix is someone with database access.
   */
  private async assertNotLastAdmin(
    tenantId: string,
    user: User,
    action: string,
  ): Promise<void> {
    if (!ADMIN_ROLES.has(user.role)) return;
    const others = await this.prisma.user.count({
      where: {
        tenantId,
        isActive: true,
        role: { in: [...ADMIN_ROLES] },
        id: { not: user.id },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        `This is the only active administrator, so you cannot ${action} it. ` +
          'Give another account an administrator role first.',
      );
    }
  }
}

/** Roles that can administer the hospital, and so must never all be removed. */
const ADMIN_ROLES = new Set<User['role']>(['platform_admin', 'hospital_admin']);

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    practitionerId: row.practitioner?.id ?? null,
    staffNo: row.staffProfile?.staffNo ?? null,
  };
}
