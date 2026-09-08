import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  type BirthRecord,
  type CreateBirthRecordInput,
  type CreateDeathRecordInput,
  type DeathRecord,
  type RecordRegistrationInput,
  type UpdateBirthRecordInput,
  type UpdateDeathRecordInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate, parseIsoDateOrNull } from '../../common/util/dates.js';
import { hashNationalId } from '../../common/util/national-id.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  birthInclude,
  deathInclude,
  toBirthRecordDto,
  toDeathRecordDto,
} from './registers.mapper.js';

export interface BirthListFilter {
  q?: string;
  from?: string;
  to?: string;
  gender?: BirthRecord['gender'];
  deliveryType?: BirthRecord['deliveryType'];
  unregisteredOnly?: boolean | string;
}

export interface DeathListFilter {
  q?: string;
  from?: string;
  to?: string;
  unregisteredOnly?: boolean | string;
}

const isTrue = (v: boolean | string | undefined) =>
  v === true || (typeof v === 'string' && ['true', '1', 'yes', 'on'].includes(v.toLowerCase()));

/**
 * The birth and death registers.
 *
 * The hospital does not register these with the state — it issues the source
 * document and the family takes it to the Union Council. So a record carries
 * the hospital's own serial from the moment it is created, and gains the state
 * registration number later, sometimes months later.
 *
 * Recording a death also sets `Patient.status = deceased` in the same
 * transaction. Two places that both claim to know whether somebody is alive
 * will eventually disagree, and this is not a fact to be wrong about.
 */
@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly config: ConfigService,
  ) {}

  private hash(cnic: string | undefined) {
    if (!cnic) return null;
    return hashNationalId(
      cnic,
      this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT'),
    );
  }

  // --- births ---------------------------------------------------------

  async listBirths(
    tenantId: string,
    filter: BirthListFilter,
  ): Promise<BirthRecord[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.birthRecord.findMany({
      where: {
        tenantId,
        ...(filter.gender ? { gender: filter.gender } : {}),
        ...(filter.deliveryType ? { deliveryType: filter.deliveryType } : {}),
        ...(isTrue(filter.unregisteredOnly) ? { registrationNo: null } : {}),
        ...(filter.from ? { bornAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { bornAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { certificateNo: { contains: q, mode: 'insensitive' as const } },
                { childName: { contains: q, mode: 'insensitive' as const } },
                { motherName: { contains: q, mode: 'insensitive' as const } },
                { fatherName: { contains: q, mode: 'insensitive' as const } },
                { registrationNo: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: birthInclude,
      orderBy: [{ bornAt: 'desc' }],
    });
    return this.withRecorders(tenantId, rows, toBirthRecordDto);
  }

  async getBirth(tenantId: string, id: string): Promise<BirthRecord> {
    const row = await this.prisma.birthRecord.findFirst({
      where: { id, tenantId },
      include: birthInclude,
    });
    if (!row) throw new NotFoundException('Birth record not found');
    const [dto] = await this.withRecorders(tenantId, [row], toBirthRecordDto);
    return dto;
  }

  async createBirth(
    tenantId: string,
    recordedById: string,
    input: CreateBirthRecordInput,
  ): Promise<BirthRecord> {
    if (!input.motherPatientId && !input.motherName?.trim()) {
      throw new BadRequestException(
        "Give the mother's name when she is not registered here",
      );
    }
    await this.assertPatients(tenantId, [
      input.motherPatientId,
      input.childPatientId,
    ]);

    const motherCnic = this.hash(input.motherCnic);
    const fatherCnic = this.hash(input.fatherCnic);

    const created = await this.prisma.$transaction(async (tx) => {
      const certificateNo = await this.sequence.next(tx, tenantId, 'birth');
      return tx.birthRecord.create({
        data: {
          tenantId,
          certificateNo,
          childName: input.childName ?? null,
          gender: input.gender,
          bornAt: new Date(input.bornAt),
          birthWeightGrams: input.birthWeightGrams ?? null,
          deliveryType: input.deliveryType,
          motherPatientId: input.motherPatientId ?? null,
          motherName: input.motherName ?? null,
          motherCnicHash: motherCnic?.hash ?? null,
          motherCnicLast4: motherCnic?.last4 ?? null,
          fatherName: input.fatherName ?? null,
          fatherCnicHash: fatherCnic?.hash ?? null,
          fatherCnicLast4: fatherCnic?.last4 ?? null,
          contactPhone: input.contactPhone ?? null,
          address: input.address ?? null,
          attendedById: input.attendedById ?? null,
          childPatientId: input.childPatientId ?? null,
          note: input.note ?? null,
          recordedById,
        },
        include: birthInclude,
      });
    });

    const [dto] = await this.withRecorders(tenantId, [created], toBirthRecordDto);
    return dto;
  }

  async updateBirth(
    tenantId: string,
    id: string,
    input: UpdateBirthRecordInput,
  ): Promise<BirthRecord> {
    await this.assertBirthExists(tenantId, id);
    await this.assertPatients(tenantId, [
      input.motherPatientId ?? undefined,
      input.childPatientId ?? undefined,
    ]);
    const motherCnic = this.hash(input.motherCnic);
    const fatherCnic = this.hash(input.fatherCnic);

    const updated = await this.prisma.birthRecord.update({
      where: { id },
      data: {
        ...(input.childName === undefined ? {} : { childName: input.childName }),
        ...(input.gender === undefined ? {} : { gender: input.gender }),
        ...(input.bornAt === undefined ? {} : { bornAt: new Date(input.bornAt) }),
        ...(input.birthWeightGrams === undefined
          ? {}
          : { birthWeightGrams: input.birthWeightGrams }),
        ...(input.deliveryType === undefined
          ? {}
          : { deliveryType: input.deliveryType }),
        ...(input.motherPatientId === undefined
          ? {}
          : { motherPatientId: input.motherPatientId }),
        ...(input.motherName === undefined ? {} : { motherName: input.motherName }),
        ...(motherCnic
          ? { motherCnicHash: motherCnic.hash, motherCnicLast4: motherCnic.last4 }
          : {}),
        ...(input.fatherName === undefined ? {} : { fatherName: input.fatherName }),
        ...(fatherCnic
          ? { fatherCnicHash: fatherCnic.hash, fatherCnicLast4: fatherCnic.last4 }
          : {}),
        ...(input.contactPhone === undefined
          ? {}
          : { contactPhone: input.contactPhone }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.attendedById === undefined
          ? {}
          : { attendedById: input.attendedById }),
        ...(input.childPatientId === undefined
          ? {}
          : { childPatientId: input.childPatientId }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.registrationNo === undefined
          ? {}
          : { registrationNo: input.registrationNo }),
        ...(input.registeredOn === undefined
          ? {}
          : { registeredOn: parseIsoDateOrNull(input.registeredOn) }),
      },
      include: birthInclude,
    });
    const [dto] = await this.withRecorders(tenantId, [updated], toBirthRecordDto);
    return dto;
  }

  /** The Union Council registration, once the family reports it back. */
  async registerBirth(
    tenantId: string,
    id: string,
    input: RecordRegistrationInput,
  ): Promise<BirthRecord> {
    await this.assertBirthExists(tenantId, id);
    const updated = await this.prisma.birthRecord.update({
      where: { id },
      data: {
        registrationNo: input.registrationNo,
        registeredOn: parseIsoDate(input.registeredOn),
      },
      include: birthInclude,
    });
    const [dto] = await this.withRecorders(tenantId, [updated], toBirthRecordDto);
    return dto;
  }

  // --- deaths ---------------------------------------------------------

  async listDeaths(
    tenantId: string,
    filter: DeathListFilter,
  ): Promise<DeathRecord[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.deathRecord.findMany({
      where: {
        tenantId,
        ...(isTrue(filter.unregisteredOnly) ? { registrationNo: null } : {}),
        ...(filter.from ? { diedAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { diedAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { certificateNo: { contains: q, mode: 'insensitive' as const } },
                { causeOfDeath: { contains: q, mode: 'insensitive' as const } },
                { registrationNo: { contains: q, mode: 'insensitive' as const } },
                { patient: { mrn: { contains: q, mode: 'insensitive' as const } } },
                {
                  patient: {
                    OR: [
                      { firstName: { contains: q, mode: 'insensitive' as const } },
                      { lastName: { contains: q, mode: 'insensitive' as const } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: deathInclude,
      orderBy: [{ diedAt: 'desc' }],
    });
    return this.withRecorders(tenantId, rows, toDeathRecordDto);
  }

  async getDeath(tenantId: string, id: string): Promise<DeathRecord> {
    const row = await this.prisma.deathRecord.findFirst({
      where: { id, tenantId },
      include: deathInclude,
    });
    if (!row) throw new NotFoundException('Death record not found');
    const [dto] = await this.withRecorders(tenantId, [row], toDeathRecordDto);
    return dto;
  }

  /**
   * Record a death.
   *
   * This also marks the patient deceased, in the same transaction. The whole
   * point of putting the register here rather than in a ledger book is that the
   * rest of the system stops treating the person as bookable — and that only
   * works if the two facts cannot come apart.
   */
  async createDeath(
    tenantId: string,
    recordedById: string,
    input: CreateDeathRecordInput,
  ): Promise<DeathRecord> {
    const created = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      const existing = await tx.deathRecord.findFirst({
        where: { patientId: patient.id, tenantId },
        select: { certificateNo: true },
      });
      if (existing) {
        throw new ConflictException(
          `A death is already recorded for this patient (${existing.certificateNo})`,
        );
      }

      const certificateNo = await this.sequence.next(tx, tenantId, 'death');
      const row = await tx.deathRecord.create({
        data: {
          tenantId,
          certificateNo,
          patientId: patient.id,
          diedAt: new Date(input.diedAt),
          causeOfDeath: input.causeOfDeath,
          placeOfDeath: input.placeOfDeath ?? null,
          certifiedById: input.certifiedById ?? null,
          informantName: input.informantName ?? null,
          informantPhone: input.informantPhone ?? null,
          informantRelation: input.informantRelation ?? null,
          note: input.note ?? null,
          recordedById,
        },
        include: deathInclude,
      });

      await tx.patient.update({
        where: { id: patient.id },
        data: { status: 'deceased' },
      });

      return row;
    });

    const [dto] = await this.withRecorders(tenantId, [created], toDeathRecordDto);
    return dto;
  }

  async updateDeath(
    tenantId: string,
    id: string,
    input: UpdateDeathRecordInput,
  ): Promise<DeathRecord> {
    await this.assertDeathExists(tenantId, id);
    const updated = await this.prisma.deathRecord.update({
      where: { id },
      data: {
        ...(input.diedAt === undefined ? {} : { diedAt: new Date(input.diedAt) }),
        ...(input.causeOfDeath === undefined
          ? {}
          : { causeOfDeath: input.causeOfDeath }),
        ...(input.placeOfDeath === undefined
          ? {}
          : { placeOfDeath: input.placeOfDeath }),
        ...(input.certifiedById === undefined
          ? {}
          : { certifiedById: input.certifiedById }),
        ...(input.informantName === undefined
          ? {}
          : { informantName: input.informantName }),
        ...(input.informantPhone === undefined
          ? {}
          : { informantPhone: input.informantPhone }),
        ...(input.informantRelation === undefined
          ? {}
          : { informantRelation: input.informantRelation }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.registrationNo === undefined
          ? {}
          : { registrationNo: input.registrationNo }),
        ...(input.registeredOn === undefined
          ? {}
          : { registeredOn: parseIsoDateOrNull(input.registeredOn) }),
      },
      include: deathInclude,
    });
    const [dto] = await this.withRecorders(tenantId, [updated], toDeathRecordDto);
    return dto;
  }

  async registerDeath(
    tenantId: string,
    id: string,
    input: RecordRegistrationInput,
  ): Promise<DeathRecord> {
    await this.assertDeathExists(tenantId, id);
    const updated = await this.prisma.deathRecord.update({
      where: { id },
      data: {
        registrationNo: input.registrationNo,
        registeredOn: parseIsoDate(input.registeredOn),
      },
      include: deathInclude,
    });
    const [dto] = await this.withRecorders(tenantId, [updated], toDeathRecordDto);
    return dto;
  }

  // --- internals ------------------------------------------------------

  private async assertBirthExists(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.birthRecord.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Birth record not found');
  }

  private async assertDeathExists(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.deathRecord.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Death record not found');
  }

  private async assertPatients(
    tenantId: string,
    ids: (string | undefined)[],
  ): Promise<void> {
    const wanted = [...new Set(ids.filter((v): v is string => !!v))];
    if (wanted.length === 0) return;
    const found = await this.prisma.patient.count({
      where: { tenantId, id: { in: wanted }, deletedAt: null },
    });
    if (found !== wanted.length) {
      throw new NotFoundException('One or more patients were not found');
    }
  }

  private dayAfter(isoDate: string): Date {
    const d = parseIsoDate(isoDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  /** One query for the whole page rather than a join per row. */
  private async withRecorders<
    R extends { recordedById: string | null },
    D,
  >(
    tenantId: string,
    rows: R[],
    map: (row: R, recordedBy: string | null) => D,
  ): Promise<D[]> {
    const ids = [
      ...new Set(rows.map((r) => r.recordedById).filter((v): v is string => !!v)),
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
    return rows.map((r) =>
      map(r, r.recordedById ? (names.get(r.recordedById) ?? null) : null),
    );
  }
}

export type { Prisma };
