import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  API_KEY_PREFIX,
  parseApiKey,
  type ApiKey,
  type ApiKeyCreated,
  type CreateApiKeyInput,
  type Permission,
  type UpdateApiKeyInput,
  apiKeyIsActive,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Only update `lastUsedAt` this often. Writing on every request would turn a
 * read-only integration into a write on every single call.
 */
const LAST_USED_THROTTLE_MS = 60_000;

type ApiKeyRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
};

/**
 * API keys.
 *
 * A key looks like `hms_<prefix>_<secret>`. The prefix identifies which row to
 * look at; the secret is compared against a stored SHA-256 hash. SHA-256 rather
 * than bcrypt deliberately: the secret is 256 bits of randomness, so there is
 * no dictionary to attack, and bcrypt's designed slowness would land on every
 * API request rather than once per login.
 *
 * The comparison is constant-time. A fast string compare leaks how many leading
 * characters were right, which over enough requests is enough to reconstruct a
 * key one character at a time.
 */
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Verify a presented key and turn it into a caller.
   *
   * Returns null for anything wrong — unknown prefix, bad secret, revoked,
   * expired — without saying which, because an error that distinguishes them
   * is an oracle for guessing valid prefixes.
   */
  async verify(raw: string): Promise<AuthUser | null> {
    const parsed = parseApiKey(raw);
    if (!parsed) return null;
    const { prefix, secret } = parsed;

    const row = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (!row) return null;

    const presented = Buffer.from(this.hash(secret), 'hex');
    const stored = Buffer.from(row.keyHash, 'hex');
    if (presented.length !== stored.length) return null;
    if (!timingSafeEqual(presented, stored)) return null;

    if (!apiKeyIsActive(
      {
        revokedAt: toIsoDateTimeOrNull(row.revokedAt),
        expiresAt: toIsoDateTimeOrNull(row.expiresAt),
      },
      new Date().toISOString(),
    )) {
      return null;
    }

    // Throttled so a busy integration does not write on every request.
    const stale =
      !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
    if (stale) {
      await this.prisma.apiKey
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined); // never fail a request over a usage stamp
    }

    return {
      id: row.id,
      email: `apikey:${row.prefix}`,
      // Carried for the audit trail only. Authorisation comes from `scopes`.
      role: 'read_only',
      tenantId: row.tenantId,
      scopes: row.scopes as Permission[],
      apiKeyId: row.id,
    };
  }

  // --- management -----------------------------------------------------

  async list(tenantId: string, includeRevoked = false): Promise<ApiKey[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId, ...(includeRevoked ? {} : { revokedAt: null }) },
      orderBy: [{ createdAt: 'desc' }],
    });
    return this.withCreators(tenantId, rows);
  }

  /**
   * Issue a key. The secret is returned exactly once and never stored — if it
   * is lost the key is rotated, because a system that can show you the secret
   * again is a system that can leak it.
   */
  async create(
    tenantId: string,
    createdById: string,
    input: CreateApiKeyInput,
  ): Promise<ApiKeyCreated> {
    const prefixPart = randomBytes(4).toString('hex');
    const prefix = `${API_KEY_PREFIX}_${prefixPart}`;
    const secret = randomBytes(32).toString('base64url');

    const created = await this.prisma.apiKey
      .create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          prefix,
          keyHash: this.hash(secret),
          scopes: input.scopes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdById,
        },
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException('Key collision — try again');
        }
        throw e;
      });

    const [dto] = await this.withCreators(tenantId, [created]);
    return { ...dto, secret: `${prefix}_${secret}` };
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKey> {
    const current = await this.find(tenantId, id);
    if (current.revokedAt) {
      throw new ConflictException('That key has been revoked and cannot be changed');
    }
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
        ...(input.expiresAt === undefined
          ? {}
          : { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }),
      },
    });
    const [dto] = await this.withCreators(tenantId, [updated]);
    return dto;
  }

  /** Revoking is immediate and permanent. There is no un-revoke — rotate instead. */
  async revoke(tenantId: string, id: string): Promise<ApiKey> {
    const current = await this.find(tenantId, id);
    if (current.revokedAt) {
      throw new ConflictException('That key is already revoked');
    }
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    const [dto] = await this.withCreators(tenantId, [updated]);
    return dto;
  }

  private async find(tenantId: string, id: string): Promise<ApiKeyRow> {
    const row = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('API key not found');
    return row;
  }

  private async withCreators(
    tenantId: string,
    rows: ApiKeyRow[],
  ): Promise<ApiKey[]> {
    const ids = [
      ...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v)),
    ];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        names.set(u.id, `${u.firstName} ${u.lastName}`.trim());
      }
    }
    const now = new Date().toISOString();
    return rows.map((r) => {
      const revokedAt = toIsoDateTimeOrNull(r.revokedAt);
      const expiresAt = toIsoDateTimeOrNull(r.expiresAt);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        prefix: r.prefix,
        scopes: r.scopes as Permission[],
        lastUsedAt: toIsoDateTimeOrNull(r.lastUsedAt),
        expiresAt,
        revokedAt,
        createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        isActive: apiKeyIsActive({ revokedAt, expiresAt }, now),
      };
    });
  }
}
