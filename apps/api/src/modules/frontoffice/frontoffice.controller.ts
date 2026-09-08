import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateComplaintInput,
  type CreatePhoneCallInput,
  type CreatePostalItemInput,
  type CreateVisitorInput,
  type UpdateComplaintInput,
  complaintListQuerySchema,
  createComplaintSchema,
  createPhoneCallSchema,
  createPostalItemSchema,
  createVisitorSchema,
  phoneCallListQuerySchema,
  postalListQuerySchema,
  updateComplaintSchema,
  visitorListQuerySchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type ComplaintListFilter,
  type PhoneCallListFilter,
  type PostalListFilter,
  type VisitorListFilter,
  FrontOfficeService,
} from './frontoffice.service.js';

/**
 * Literal sub-paths come before the `:id` routes nested under them so a param
 * route never swallows a literal.
 *
 * Complaints are separately permissioned from the rest: they name staff, and a
 * receptionist logging a visitor should not thereby read every grievance filed
 * against a colleague.
 */
@Controller('front-office')
export class FrontOfficeController {
  constructor(private readonly frontOffice: FrontOfficeService) {}

  // --- visitors ---------------------------------------------------

  @Get('visitors')
  @Permissions('frontoffice:read')
  listVisitors(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(visitorListQuerySchema)) query: VisitorListFilter,
  ) {
    return this.frontOffice.listVisitors(requireTenant(user), query);
  }

  @Post('visitors')
  @Permissions('frontoffice:manage')
  signIn(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVisitorSchema)) dto: CreateVisitorInput,
  ) {
    return this.frontOffice.signIn(requireTenant(user), user.id, dto);
  }

  @Post('visitors/:id/sign-out')
  @Permissions('frontoffice:manage')
  signOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.frontOffice.signOut(requireTenant(user), id);
  }

  // --- calls ------------------------------------------------------

  @Get('calls')
  @Permissions('frontoffice:read')
  listCalls(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(phoneCallListQuerySchema))
    query: PhoneCallListFilter,
  ) {
    return this.frontOffice.listCalls(requireTenant(user), query);
  }

  @Post('calls')
  @Permissions('frontoffice:manage')
  logCall(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPhoneCallSchema)) dto: CreatePhoneCallInput,
  ) {
    return this.frontOffice.logCall(requireTenant(user), user.id, dto);
  }

  // --- postal -----------------------------------------------------

  @Get('postal')
  @Permissions('frontoffice:read')
  listPostal(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(postalListQuerySchema)) query: PostalListFilter,
  ) {
    return this.frontOffice.listPostal(requireTenant(user), query);
  }

  @Post('postal')
  @Permissions('frontoffice:manage')
  logPostal(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPostalItemSchema)) dto: CreatePostalItemInput,
  ) {
    return this.frontOffice.logPostal(requireTenant(user), user.id, dto);
  }

  // --- complaints -------------------------------------------------

  @Get('complaints/summary')
  @Permissions('complaint:read')
  @Audit('complaint.summary')
  complaintSummary(@CurrentUser() user: AuthUser) {
    return this.frontOffice.complaintSummary(requireTenant(user));
  }

  @Get('complaints')
  @Permissions('complaint:read')
  @Audit('complaint.list')
  listComplaints(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(complaintListQuerySchema))
    query: ComplaintListFilter,
  ) {
    return this.frontOffice.listComplaints(requireTenant(user), query);
  }

  @Post('complaints')
  @Permissions('complaint:manage')
  @Audit('complaint.create')
  createComplaint(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createComplaintSchema)) dto: CreateComplaintInput,
  ) {
    return this.frontOffice.createComplaint(requireTenant(user), user.id, dto);
  }

  @Patch('complaints/:id')
  @Permissions('complaint:manage')
  @Audit('complaint.update')
  updateComplaint(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateComplaintSchema)) dto: UpdateComplaintInput,
  ) {
    return this.frontOffice.updateComplaint(requireTenant(user), id, dto);
  }
}
