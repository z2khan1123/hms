import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  PORTAL_TOKEN_TYPE,
  type ChangePortalPasswordInput,
  type InvitePortalAccountInput,
  type PortalAccount,
  type PortalInvite,
  type PortalLoginInput,
  type PortalSession,
  type SetPortalPasswordInput,
  portalJwtPayloadSchema,
} from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_HOURS = 72;
const SESSION_TTL = '30m';

/** Wrong-password budget before the account is locked for a while. */
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Portal authentication.
 *
 * The portal is a separate credential space from staff, and this is the file
 * that keeps it separate. A portal token carries `typ: 'portal'` and a patient
 * id, and nothing else — no role, no permissions. The staff middleware refuses
 * to build a `req.user` from it, so a portal token cannot reach a staff route
 * even if someone points it at one.
 *
 * Patients are invited by staff rather than self-registering. Anyone can type
 * an MRN off a slip they found; a desk that has seen the person is the check
 * that the account belongs to them.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  // --- staff side: inviting ------------------------------------------

  async listAccounts(tenantId: string): Promise<PortalAccount[]> {
    const rows = await this.prisma.patientAccount.findMany({
      where: { tenantId },
      include: { patient: { select: { mrn: true, firstName: true, lastName: true } } },
      orderBy: { invitedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Create or re-issue an invitation. The one-time code is returned once and
   * stored only as a hash — the same rule as an API key, for the same reason.
   */
  async invite(
    tenantId: string,
    invitedById: string,
    input: InvitePortalAccountInput,
  ): Promise<PortalInvite> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, tenantId, deletedAt: null },
      select: { id: true, mrn: true, firstName: true, lastName: true, status: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.status === 'deceased') {
      throw new ForbiddenException('That patient is recorded as deceased');
    }

    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);

    const row = await this.prisma.patientAccount.upsert({
      where: { patientId: patient.id },
      create: {
        tenantId,
        patientId: patient.id,
        email: input.email ?? null,
        phone: input.phone ?? null,
        inviteTokenHash: sha256(token),
        inviteExpiresAt: expires,
        invitedById,
      },
      update: {
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        inviteTokenHash: sha256(token),
        inviteExpiresAt: expires,
        // Re-inviting clears a lockout; it does not clear an existing password.
        failedAttempts: 0,
        lockedUntil: null,
        isActive: true,
        invitedById,
      },
      include: { patient: { select: { mrn: true, firstName: true, lastName: true } } },
    });

    return {
      ...this.toDto(row),
      inviteToken: token,
      inviteExpiresAt: expires.toISOString(),
    };
  }

  async setActive(
    tenantId: string,
    patientId: string,
    isActive: boolean,
  ): Promise<PortalAccount> {
    const found = await this.prisma.patientAccount.findFirst({
      where: { patientId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Portal account not found');
    const row = await this.prisma.patientAccount.update({
      where: { id: found.id },
      data: { isActive },
      include: { patient: { select: { mrn: true, firstName: true, lastName: true } } },
    });
    return this.toDto(row);
  }

  // --- patient side --------------------------------------------------

  /** Redeem an invitation and set the first password. */
  async setPassword(input: SetPortalPasswordInput): Promise<void> {
    const row = await this.prisma.patientAccount.findFirst({
      where: { inviteTokenHash: sha256(input.token) },
    });
    // One message for both cases: saying "expired" tells a guesser the code
    // was otherwise right.
    if (!row || !row.inviteExpiresAt || row.inviteExpiresAt < new Date()) {
      throw new UnauthorizedException('That invitation is not valid');
    }

    await this.prisma.patientAccount.update({
      where: { id: row.id },
      data: {
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        // Single use. The code cannot be replayed to reset the password again.
        inviteTokenHash: null,
        inviteExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async login(input: PortalLoginInput): Promise<PortalSession> {
    const patient = await this.prisma.patient.findFirst({
      where: { mrn: input.mrn, deletedAt: null },
      select: { id: true, mrn: true, firstName: true, lastName: true, tenantId: true },
    });

    const account = patient
      ? await this.prisma.patientAccount.findUnique({
          where: { patientId: patient.id },
        })
      : null;

    if (account?.lockedUntil && account.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Too many attempts. Try again shortly, or ask the front desk.',
      );
    }

    const ok =
      account?.passwordHash != null &&
      account.isActive &&
      (await bcrypt.compare(input.password, account.passwordHash));

    if (!patient || !account || !ok) {
      if (account) await this.recordFailure(account.id, account.failedAttempts);
      // Never distinguish an unknown MRN from a wrong password: the difference
      // tells a stranger whether an MRN they guessed is real.
      throw new UnauthorizedException('Those details are not right');
    }

    await this.prisma.patientAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: account.id,
        typ: PORTAL_TOKEN_TYPE,
        patientId: patient.id,
        tenantId: patient.tenantId,
      },
      { secret: this.secret(), expiresIn: SESSION_TTL },
    );

    return {
      accessToken,
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
      },
    };
  }

  async changePassword(
    accountId: string,
    input: ChangePortalPasswordInput,
  ): Promise<void> {
    const account = await this.prisma.patientAccount.findUnique({
      where: { id: accountId },
    });
    if (!account?.passwordHash) throw new UnauthorizedException('Not signed in');
    const ok = await bcrypt.compare(input.currentPassword, account.passwordHash);
    if (!ok) throw new UnauthorizedException('That is not your current password');

    await this.prisma.patientAccount.update({
      where: { id: account.id },
      data: { passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS) },
    });
  }

  /**
   * Verify a presented portal token.
   *
   * The `typ` claim is checked explicitly. Without it, a staff access token
   * signed with the same secret would satisfy the shape and let a staff token
   * act as some patient — and vice versa.
   */
  async verifyToken(
    raw: string,
  ): Promise<{ accountId: string; patientId: string; tenantId: string } | null> {
    try {
      const payload = portalJwtPayloadSchema.parse(
        this.jwt.verify(raw, { secret: this.secret() }),
      );
      const account = await this.prisma.patientAccount.findFirst({
        where: {
          id: payload.sub,
          patientId: payload.patientId,
          tenantId: payload.tenantId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!account) return null;
      return {
        accountId: payload.sub,
        patientId: payload.patientId,
        tenantId: payload.tenantId,
      };
    } catch {
      return null;
    }
  }

  private async recordFailure(id: string, current: number): Promise<void> {
    const next = current + 1;
    await this.prisma.patientAccount
      .update({
        where: { id },
        data: {
          failedAttempts: next,
          ...(next >= MAX_FAILED
            ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedAttempts: 0 }
            : {}),
        },
      })
      .catch(() => undefined);
  }

  private toDto(r: {
    id: string;
    patientId: string;
    email: string | null;
    phone: string | null;
    passwordHash: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    invitedAt: Date;
    patient: { mrn: string; firstName: string; lastName: string };
  }): PortalAccount {
    return {
      id: r.id,
      patientId: r.patientId,
      mrn: r.patient.mrn,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
      email: r.email,
      phone: r.phone,
      isActive: r.isActive,
      hasPassword: !!r.passwordHash,
      lastLoginAt: toIsoDateTimeOrNull(r.lastLoginAt),
      invitedAt: r.invitedAt.toISOString(),
    };
  }
}
