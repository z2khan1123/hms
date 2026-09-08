import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Complaint,
  type CreateComplaintInput,
  type CreatePhoneCallInput,
  type CreatePostalItemInput,
  type CreateVisitorInput,
  type PhoneCall,
  type PostalItem,
  type UpdateComplaintInput,
  type Visitor,
  complaintAgeDays,
  requiresResolution,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate, parseIsoDateOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  complaintInclude,
  patientOnly,
  toComplaintDto,
  toPhoneCallDto,
  toPostalItemDto,
  toVisitorDto,
} from './frontoffice.mapper.js';

export interface VisitorListFilter {
  q?: string;
  patientId?: string;
  from?: string;
  to?: string;
  insideOnly?: boolean;
}

export interface PhoneCallListFilter {
  q?: string;
  direction?: PhoneCall['direction'];
  patientId?: string;
  from?: string;
  to?: string;
  dueOnly?: boolean;
}

export interface PostalListFilter {
  q?: string;
  direction?: PostalItem['direction'];
  from?: string;
  to?: string;
}

export interface ComplaintListFilter {
  q?: string;
  status?: Complaint['status'];
  severity?: Complaint['severity'];
  patientId?: string;
  from?: string;
  to?: string;
  openOnly?: boolean;
}

/**
 * Front office: the visitor book, the call log, the postal register and
 * complaints.
 *
 * None of this is clinical, so none of it hangs off a Case. It is a record of
 * the building — and it is what auditors and families ask about months later.
 */
@Injectable()
export class FrontOfficeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  private now(): string {
    return new Date().toISOString();
  }

  // --- visitors -------------------------------------------------------

  async listVisitors(
    tenantId: string,
    filter: VisitorListFilter,
  ): Promise<Visitor[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.visitorLog.findMany({
      where: {
        tenantId,
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.insideOnly ? { leftAt: null } : {}),
        ...(filter.from ? { arrivedAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { arrivedAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { passNo: { contains: q, mode: 'insensitive' as const } },
                { name: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
                { visitingWhom: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: patientOnly,
      orderBy: [{ arrivedAt: 'desc' }],
    });
    return this.withRecorders(tenantId, rows, toVisitorDto);
  }

  async signIn(
    tenantId: string,
    recordedById: string,
    input: CreateVisitorInput,
  ): Promise<Visitor> {
    await this.assertPatient(tenantId, input.patientId);
    if (!input.patientId && !input.visitingWhom?.trim()) {
      throw new BadRequestException('Say who the visitor has come to see');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const passNo = await this.sequence.next(tx, tenantId, 'visitor');
      return tx.visitorLog.create({
        data: {
          tenantId,
          passNo,
          name: input.name,
          phone: input.phone ?? null,
          patientId: input.patientId ?? null,
          visitingWhom: input.visitingWhom ?? null,
          purpose: input.purpose ?? null,
          idCardLast4: input.idCardLast4 ?? null,
          numberOfVisitors: input.numberOfVisitors ?? 1,
          arrivedAt: input.arrivedAt ? new Date(input.arrivedAt) : new Date(),
          note: input.note ?? null,
          recordedById,
        },
        include: patientOnly,
      });
    });
    const [dto] = await this.withRecorders(tenantId, [created], toVisitorDto);
    return dto;
  }

  /** Signing out is what makes the "still inside" list an evacuation list. */
  async signOut(tenantId: string, id: string): Promise<Visitor> {
    const row = await this.prisma.visitorLog.findFirst({
      where: { id, tenantId },
      select: { id: true, leftAt: true },
    });
    if (!row) throw new NotFoundException('Visitor not found');
    if (row.leftAt) throw new ConflictException('That visitor has already signed out');

    const updated = await this.prisma.visitorLog.update({
      where: { id },
      data: { leftAt: new Date() },
      include: patientOnly,
    });
    const [dto] = await this.withRecorders(tenantId, [updated], toVisitorDto);
    return dto;
  }

  // --- calls ----------------------------------------------------------

  async listCalls(
    tenantId: string,
    filter: PhoneCallListFilter,
  ): Promise<PhoneCall[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.phoneCallLog.findMany({
      where: {
        tenantId,
        ...(filter.direction ? { direction: filter.direction } : {}),
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.dueOnly
          ? { followUpOn: { lte: parseIsoDate(this.now().slice(0, 10)) } }
          : {}),
        ...(filter.from ? { calledAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { calledAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { callerName: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
                { purpose: { contains: q, mode: 'insensitive' as const } },
                { outcome: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: patientOnly,
      orderBy: [{ calledAt: 'desc' }],
    });
    return this.withRecorders(tenantId, rows, toPhoneCallDto);
  }

  async logCall(
    tenantId: string,
    recordedById: string,
    input: CreatePhoneCallInput,
  ): Promise<PhoneCall> {
    await this.assertPatient(tenantId, input.patientId);
    const created = await this.prisma.phoneCallLog.create({
      data: {
        tenantId,
        direction: input.direction,
        callerName: input.callerName,
        phone: input.phone ?? null,
        patientId: input.patientId ?? null,
        purpose: input.purpose ?? null,
        calledAt: input.calledAt ? new Date(input.calledAt) : new Date(),
        durationMinutes: input.durationMinutes ?? null,
        outcome: input.outcome ?? null,
        followUpOn: parseIsoDateOrNull(input.followUpOn),
        note: input.note ?? null,
        recordedById,
      },
      include: patientOnly,
    });
    const [dto] = await this.withRecorders(tenantId, [created], toPhoneCallDto);
    return dto;
  }

  // --- postal ---------------------------------------------------------

  async listPostal(
    tenantId: string,
    filter: PostalListFilter,
  ): Promise<PostalItem[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.postalLog.findMany({
      where: {
        tenantId,
        ...(filter.direction ? { direction: filter.direction } : {}),
        ...(filter.from ? { onDate: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { onDate: { lte: parseIsoDate(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { party: { contains: q, mode: 'insensitive' as const } },
                { addressedTo: { contains: q, mode: 'insensitive' as const } },
                { reference: { contains: q, mode: 'insensitive' as const } },
                { trackingNo: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ onDate: 'desc' }],
    });
    return this.withRecorders(tenantId, rows, toPostalItemDto);
  }

  async logPostal(
    tenantId: string,
    recordedById: string,
    input: CreatePostalItemInput,
  ): Promise<PostalItem> {
    const created = await this.prisma.postalLog.create({
      data: {
        tenantId,
        direction: input.direction,
        party: input.party,
        addressedTo: input.addressedTo ?? null,
        reference: input.reference ?? null,
        courier: input.courier ?? null,
        trackingNo: input.trackingNo ?? null,
        onDate: parseIsoDate(input.onDate),
        note: input.note ?? null,
        recordedById,
      },
    });
    const [dto] = await this.withRecorders(tenantId, [created], toPostalItemDto);
    return dto;
  }

  // --- complaints -----------------------------------------------------

  async listComplaints(
    tenantId: string,
    filter: ComplaintListFilter,
  ): Promise<Complaint[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.complaint.findMany({
      where: {
        tenantId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.openOnly ? { status: { in: ['open', 'in_progress'] } } : {}),
        ...(filter.from ? { receivedAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { receivedAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: 'insensitive' as const } },
                { complainantName: { contains: q, mode: 'insensitive' as const } },
                { description: { contains: q, mode: 'insensitive' as const } },
                { about: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: complaintInclude,
      orderBy: [{ receivedAt: 'desc' }],
    });
    const now = this.now();
    return this.withRecorders(tenantId, rows, (r, recordedBy) =>
      toComplaintDto(r, recordedBy, now),
    );
  }

  async createComplaint(
    tenantId: string,
    recordedById: string,
    input: CreateComplaintInput,
  ): Promise<Complaint> {
    await this.assertPatient(tenantId, input.patientId);
    if (input.assignedToId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.assignedToId, tenantId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Assignee not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const reference = await this.sequence.next(tx, tenantId, 'complaint');
      return tx.complaint.create({
        data: {
          tenantId,
          reference,
          complainantName: input.complainantName,
          phone: input.phone ?? null,
          patientId: input.patientId ?? null,
          about: input.about ?? null,
          severity: input.severity,
          description: input.description,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          assignedToId: input.assignedToId ?? null,
          recordedById,
        },
        include: complaintInclude,
      });
    });
    const now = this.now();
    const [dto] = await this.withRecorders(tenantId, [created], (r, rb) =>
      toComplaintDto(r, rb, now),
    );
    return dto;
  }

  /**
   * A complaint cannot be marked resolved or closed without somebody writing
   * down what was actually done. A status field alone records that a complaint
   * stopped being tracked, which is not the same as it being dealt with.
   */
  async updateComplaint(
    tenantId: string,
    id: string,
    input: UpdateComplaintInput,
  ): Promise<Complaint> {
    const current = await this.prisma.complaint.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, resolution: true, resolvedAt: true },
    });
    if (!current) throw new NotFoundException('Complaint not found');

    const nextStatus = input.status ?? current.status;
    const nextResolution =
      input.resolution === undefined ? current.resolution : input.resolution;

    if (requiresResolution(nextStatus) && !nextResolution?.trim()) {
      throw new BadRequestException(
        'Write down what was done before marking this resolved',
      );
    }

    const becomingSettled =
      requiresResolution(nextStatus) && !requiresResolution(current.status);

    const updated = await this.prisma.complaint.update({
      where: { id },
      data: {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.severity === undefined ? {} : { severity: input.severity }),
        ...(input.assignedToId === undefined
          ? {}
          : { assignedToId: input.assignedToId }),
        ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
        ...(input.about === undefined ? {} : { about: input.about }),
        ...(becomingSettled ? { resolvedAt: current.resolvedAt ?? new Date() } : {}),
        ...(input.status && !requiresResolution(input.status)
          ? { resolvedAt: null }
          : {}),
      },
      include: complaintInclude,
    });
    const now = this.now();
    const [dto] = await this.withRecorders(tenantId, [updated], (r, rb) =>
      toComplaintDto(r, rb, now),
    );
    return dto;
  }

  /** How long complaints are taking, which is what a review actually asks. */
  async complaintSummary(tenantId: string): Promise<{
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    averageDaysToResolve: number | null;
    oldestOpenDays: number | null;
  }> {
    const rows = await this.prisma.complaint.findMany({
      where: { tenantId },
      select: { status: true, receivedAt: true, resolvedAt: true },
    });
    const now = this.now();
    const settled = rows.filter((r) => r.resolvedAt);
    const openRows = rows.filter((r) => r.status === 'open' || r.status === 'in_progress');

    const ages = settled.map((r) =>
      complaintAgeDays(r.receivedAt.toISOString(), r.resolvedAt?.toISOString() ?? null, now),
    );
    const openAges = openRows.map((r) =>
      complaintAgeDays(r.receivedAt.toISOString(), null, now),
    );

    return {
      open: rows.filter((r) => r.status === 'open').length,
      inProgress: rows.filter((r) => r.status === 'in_progress').length,
      resolved: rows.filter((r) => r.status === 'resolved').length,
      closed: rows.filter((r) => r.status === 'closed').length,
      averageDaysToResolve:
        ages.length === 0
          ? null
          : Math.round(ages.reduce((a, b) => a + b, 0) / ages.length),
      oldestOpenDays: openAges.length === 0 ? null : Math.max(...openAges),
    };
  }

  // --- internals ------------------------------------------------------

  private async assertPatient(
    tenantId: string,
    patientId: string | undefined,
  ): Promise<void> {
    if (!patientId) return;
    const found = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Patient not found');
  }

  private dayAfter(isoDate: string): Date {
    const d = parseIsoDate(isoDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  private async withRecorders<R extends { recordedById: string | null }, D>(
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
