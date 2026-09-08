import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type BloodGroup,
  type BloodIssue,
  type BloodStock,
  type BloodUnit,
  type CreateDonorInput,
  type Donor,
  type IssueBloodInput,
  type RecordDonationInput,
  type UpdateDonorInput,
  BLOOD_GROUPS,
  bloodComponentSchema,
  bloodUnitStatusOf,
  incompatibilityReason,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate, parseIsoDateOrNull, toIsoDate } from '../../common/util/dates.js';
import { compareNatural } from '../../common/util/natural-sort.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  type BloodUnitRow,
  bloodIssueInclude,
  bloodUnitInclude,
  donorInclude,
  fromBloodGroup,
  toBloodGroup,
  toBloodIssueDto,
  toBloodUnitDto,
  toDonorDto,
} from './bloodbank.mapper.js';

export interface DonorListFilter {
  q?: string;
  bloodGroup?: BloodGroup;
  eligibleOnly?: boolean;
  includeInactive?: boolean;
}

export interface UnitListFilter {
  bloodGroup?: BloodGroup;
  component?: BloodUnit['component'];
  status?: BloodUnit['status'];
  q?: string;
  expiringWithinDays?: number;
}

export interface IssueListFilter {
  patientId?: string;
  caseId?: string;
  bloodGroup?: BloodGroup;
  from?: string;
  to?: string;
}

const EXPIRING_SOON_DAYS = 7;

/**
 * The blood bank.
 *
 * Two rules carry this module. Stock is derived — a bag is available when it
 * has not been issued, discarded, or passed its expiry, and there is no counter
 * to disagree with the shelf. And an issue is checked against the shared
 * `isCompatible` before anything is written: an incompatible transfusion is
 * refused with a 409, not warned about. That refusal is the whole reason this
 * module exists rather than a spreadsheet.
 */
@Injectable()
export class BloodBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
    private readonly billing: BillingService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // --- donors ---------------------------------------------------------

  async listDonors(tenantId: string, filter: DonorListFilter): Promise<Donor[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.donor.findMany({
      where: {
        tenantId,
        ...(filter.includeInactive ? {} : { isActive: true }),
        ...(filter.bloodGroup ? { bloodGroup: fromBloodGroup(filter.bloodGroup) } : {}),
        ...(q
          ? {
              OR: [
                { donorNo: { contains: q, mode: 'insensitive' as const } },
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      include: donorInclude,
    });

    const today = this.today();
    return rows
      .map((r) => toDonorDto(r, today))
      .filter((d) => !filter.eligibleOnly || !d.isDeferred)
      .sort((a, b) => compareNatural(a.donorNo, b.donorNo));
  }

  async getDonor(tenantId: string, id: string): Promise<Donor> {
    const row = await this.prisma.donor.findFirst({
      where: { id, tenantId },
      include: donorInclude,
    });
    if (!row) throw new NotFoundException('Donor not found');
    return toDonorDto(row, this.today());
  }

  async createDonor(tenantId: string, input: CreateDonorInput): Promise<Donor> {
    const created = await this.prisma.$transaction(async (tx) => {
      const donorNo = await this.sequence.next(tx, tenantId, 'donor');
      return tx.donor.create({
        data: {
          tenantId,
          donorNo,
          firstName: input.firstName,
          lastName: input.lastName,
          bloodGroup: fromBloodGroup(input.bloodGroup),
          phone: input.phone,
          birthDate: parseIsoDateOrNull(input.birthDate),
          address: input.address ?? null,
          note: input.note ?? null,
        },
        include: donorInclude,
      });
    });
    return toDonorDto(created, this.today());
  }

  async updateDonor(
    tenantId: string,
    id: string,
    input: UpdateDonorInput,
  ): Promise<Donor> {
    await this.assertDonorExists(tenantId, id);
    const updated = await this.prisma.donor.update({
      where: { id },
      data: {
        ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
        ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
        ...(input.bloodGroup === undefined
          ? {}
          : { bloodGroup: fromBloodGroup(input.bloodGroup) }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.birthDate === undefined
          ? {}
          : { birthDate: parseIsoDateOrNull(input.birthDate) }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      include: donorInclude,
    });
    return toDonorDto(updated, this.today());
  }

  // --- units ----------------------------------------------------------

  async listUnits(tenantId: string, filter: UnitListFilter): Promise<BloodUnit[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.bloodUnit.findMany({
      where: {
        tenantId,
        ...(filter.bloodGroup ? { bloodGroup: fromBloodGroup(filter.bloodGroup) } : {}),
        ...(filter.component ? { component: filter.component } : {}),
        ...(q ? { bagNo: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(filter.expiringWithinDays !== undefined
          ? {
              issuedAt: null,
              discardedAt: null,
              expiresOn: {
                gte: parseIsoDate(this.today()),
                lte: this.datePlus(filter.expiringWithinDays),
              },
            }
          : {}),
      },
      include: bloodUnitInclude,
      orderBy: [{ expiresOn: 'asc' }],
    });

    const today = this.today();
    const dtos = rows.map((r) => toBloodUnitDto(r, today));
    // Status is derived, so it is filtered here rather than in SQL — the
    // alternative is a stored column that can disagree with the dates.
    return filter.status ? dtos.filter((d) => d.status === filter.status) : dtos;
  }

  async getUnit(tenantId: string, id: string): Promise<BloodUnit> {
    return toBloodUnitDto(await this.findUnit(tenantId, id), this.today());
  }

  /**
   * Record a collection. The expiry is taken as given rather than computed from
   * a shelf-life table: the real figure depends on the anticoagulant and on
   * whether the component was frozen, and software should not quietly decide
   * when blood stops being safe.
   */
  async recordDonation(
    tenantId: string,
    createdById: string,
    input: RecordDonationInput,
  ): Promise<BloodUnit> {
    const donor = await this.prisma.donor.findFirst({
      where: { id: input.donorId, tenantId },
      select: { id: true, bloodGroup: true, isActive: true },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    if (!donor.isActive) {
      throw new ConflictException('That donor is no longer active');
    }
    if (input.expiresOn <= input.collectedOn) {
      throw new BadRequestException('The expiry date must be after the collection date');
    }

    const created = await this.prisma.bloodUnit
      .create({
        data: {
          tenantId,
          bagNo: input.bagNo,
          // The group comes from the donor's record, not the request — one
          // fact, one place, and no way to mistype it onto the bag.
          bloodGroup: donor.bloodGroup,
          component: input.component,
          donorId: donor.id,
          collectedOn: parseIsoDate(input.collectedOn),
          expiresOn: parseIsoDate(input.expiresOn),
          volumeMl: input.volumeMl ?? null,
          screenedAt: input.screenedAt ? new Date(input.screenedAt) : null,
          screeningPassed: input.screeningPassed ?? null,
          note: input.note ?? null,
          createdById,
        },
        include: bloodUnitInclude,
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException('That bag number is already recorded');
        }
        throw e;
      });

    return toBloodUnitDto(created, this.today());
  }

  async discardUnit(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<BloodUnit> {
    const unit = await this.findUnit(tenantId, id);
    if (unit.issuedAt) {
      throw new ConflictException('That unit has already been issued');
    }
    if (unit.discardedAt) {
      throw new ConflictException('That unit has already been discarded');
    }
    const updated = await this.prisma.bloodUnit.update({
      where: { id },
      data: { discardedAt: new Date(), discardReason: reason },
      include: bloodUnitInclude,
    });
    return toBloodUnitDto(updated, this.today());
  }

  /**
   * The stock board, counted from the units themselves every time. Every group
   * appears even at zero — an empty shelf for O- is the single most important
   * thing a blood bank needs to see, and it cannot be shown by a query that
   * only returns rows that exist.
   */
  async stock(tenantId: string): Promise<BloodStock> {
    const rows = await this.prisma.bloodUnit.findMany({
      where: { tenantId },
      include: bloodUnitInclude,
    });
    const today = this.today();
    const soonCutoff = toIsoDate(this.datePlus(EXPIRING_SOON_DAYS));
    const units = rows.map((r) => toBloodUnitDto(r, today));

    const totals = {
      available: 0,
      issued: 0,
      expired: 0,
      discarded: 0,
      expiringSoon: 0,
    };
    for (const u of units) {
      totals[u.status] += 1;
      if (u.status === 'available' && u.expiresOn <= soonCutoff) {
        totals.expiringSoon += 1;
      }
    }

    const components = bloodComponentSchema.options;
    const byGroup = BLOOD_GROUPS.map((g) => {
      const mine = units.filter((u) => u.bloodGroup === g && u.status === 'available');
      return {
        bloodGroup: g,
        available: mine.length,
        expiringSoon: mine.filter((u) => u.expiresOn <= soonCutoff).length,
        byComponent: components.map((c) => ({
          component: c,
          available: mine.filter((u) => u.component === c).length,
        })),
      };
    });

    return { totals, byGroup };
  }

  // --- issuing --------------------------------------------------------

  async listIssues(tenantId: string, filter: IssueListFilter): Promise<BloodIssue[]> {
    const rows = await this.prisma.bloodIssue.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.caseId ? { caseId: filter.caseId } : {}),
        ...(filter.bloodGroup
          ? { recipientGroup: fromBloodGroup(filter.bloodGroup) }
          : {}),
        ...(filter.from ? { issuedAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to
          ? { issuedAt: { lt: this.dayAfter(filter.to) } }
          : {}),
      },
      include: bloodIssueInclude,
      orderBy: [{ issuedAt: 'desc' }],
    });
    return this.withIssuerNames(tenantId, rows);
  }

  /**
   * Issue a bag.
   *
   * The compatibility check runs before anything is written and refuses rather
   * than warns. Everything else here — the unit still being available, the
   * screen having passed, the expiry — is checked inside the same transaction
   * that marks the bag issued, so two people cannot both be handed the last
   * O-negative unit.
   */
  async issue(
    tenantId: string,
    issuedById: string,
    input: IssueBloodInput,
  ): Promise<BloodIssue> {
    const issued = await this.prisma.$transaction(async (tx) => {
      // Serialise everyone reaching for the same bag.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:bloodunit:${input.unitId}`}))`;

      const unit = await tx.bloodUnit.findFirst({
        where: { id: input.unitId, tenantId },
      });
      if (!unit) throw new NotFoundException('Blood unit not found');

      const today = new Date().toISOString().slice(0, 10);
      const status = bloodUnitStatusOf(
        {
          issuedAt: unit.issuedAt?.toISOString() ?? null,
          discardedAt: unit.discardedAt?.toISOString() ?? null,
          expiresOn: toIsoDate(unit.expiresOn),
        },
        today,
      );
      if (status !== 'available') {
        throw new ConflictException(`That unit is ${status} and cannot be issued`);
      }
      if (unit.screeningPassed === false) {
        throw new ConflictException(
          'That unit failed screening and can never be issued',
        );
      }

      // The check this module exists for.
      const reason = incompatibilityReason(
        toBloodGroup(unit.bloodGroup),
        input.recipientGroup,
        unit.component,
      );
      if (reason) throw new ConflictException(reason);

      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      // `findOrOpenInTx` validates a supplied caseId belongs to this patient,
      // and opens one when none is given.
      const kase = await this.cases.findOrOpenInTx(tx, tenantId, issuedById, {
        patientId: input.patientId,
        caseId: input.caseId,
      });
      const caseId = kase.id;

      let billItemId: string | null = null;
      if (input.priceMinor !== undefined) {
        const item = await this.billing.addBillItemInTx(tx, tenantId, issuedById, {
          caseId,
          serviceName: `Blood — ${unit.bagNo} (${toBloodGroup(unit.bloodGroup)})`,
          department: 'other',
          quantity: 1,
          priceMinor: input.priceMinor,
        });
        billItemId = item.id;
      }

      await tx.bloodUnit.update({
        where: { id: unit.id },
        data: { issuedAt: new Date() },
      });

      return tx.bloodIssue.create({
        data: {
          tenantId,
          unitId: unit.id,
          patientId: input.patientId,
          caseId,
          recipientGroup: fromBloodGroup(input.recipientGroup),
          crossMatchedBy: input.crossMatchedBy ?? null,
          billItemId,
          issuedById,
          note: input.note ?? null,
        },
        include: bloodIssueInclude,
      });
    });

    const [dto] = await this.withIssuerNames(tenantId, [issued]);
    return dto;
  }

  // --- internals ------------------------------------------------------

  private async findUnit(tenantId: string, id: string): Promise<BloodUnitRow> {
    const row = await this.prisma.bloodUnit.findFirst({
      where: { id, tenantId },
      include: bloodUnitInclude,
    });
    if (!row) throw new NotFoundException('Blood unit not found');
    return row;
  }

  private async assertDonorExists(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.donor.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Donor not found');
  }

  private datePlus(days: number): Date {
    const d = new Date(`${this.today()}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  private dayAfter(isoDate: string): Date {
    const d = parseIsoDate(isoDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  /** One query for the whole page rather than a join per row. */
  private async withIssuerNames(
    tenantId: string,
    rows: Prisma.BloodIssueGetPayload<{ include: typeof bloodIssueInclude }>[],
  ): Promise<BloodIssue[]> {
    const ids = [
      ...new Set(rows.map((r) => r.issuedById).filter((v): v is string => !!v)),
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
    const today = this.today();
    return rows.map((r) =>
      toBloodIssueDto(r, today, r.issuedById ? (names.get(r.issuedById) ?? null) : null),
    );
  }
}
