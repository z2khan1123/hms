import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import {
  type AuthResponse,
  type JwtPayload,
  type LoginInput,
  type RegisterInput,
  type SessionUser,
} from '@hms/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const BCRYPT_ROUNDS = 12;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 40);
}

function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) return 30 * 24 * 3_600_000;
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[match[2]];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Self-serve hospital signup: creates a tenant and its first hospital_admin. */
  async register(input: RegisterInput): Promise<AuthResponse> {
    if (!input.tenantName) {
      throw new BadRequestException(
        'tenantName is required to create a new hospital account',
      );
    }
    const existing = await this.prisma.user.findFirst({
      where: { email: input.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const slug = `${slugify(input.tenantName)}-${randomBytes(3).toString('hex')}`;

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName as string, slug },
      });
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'hospital_admin',
        },
      });
    });

    return this.issueSession(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, isActive: true },
    });
    const ok =
      user && (await bcrypt.compare(input.password, user.passwordHash));
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotate: the presented token is single-use.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(record.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // jsonwebtoken accepts a duration string like "15m"; its types want a
      // narrower template-literal, so widen here.
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL') as unknown as number,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(
          Date.now() +
            parseDurationMs(this.config.getOrThrow<string>('JWT_REFRESH_TTL')),
        ),
      },
    });

    return { accessToken, refreshToken, user: toSessionUser(user) };
  }
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenantId,
  };
}
