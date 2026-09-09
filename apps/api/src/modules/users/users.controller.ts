import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateUserInput,
  createUserSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type SetUserActiveInput,
  setUserActiveSchema,
  type UpdateUserInput,
  updateUserSchema,
  type UserListFilter,
  userListQuerySchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

/**
 * Staff accounts.
 *
 * Everything that changes an account is audited. This is the module where a
 * misuse hands somebody a login they should not have, so who did it and when
 * is part of the feature, not an extra.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('user:read')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(userListQuerySchema)) query: UserListFilter,
  ) {
    return this.users.list(requireTenant(user), query);
  }

  /**
   * Declared before `:id` would be, so a literal segment is never swallowed by
   * the param route.
   */
  @Get('role-matrix')
  @Permissions('user:read')
  matrix() {
    return this.users.matrix();
  }

  @Post()
  @Permissions('user:manage')
  @Audit('user.create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput,
  ) {
    return this.users.create(requireTenant(user), dto);
  }

  @Patch(':id')
  @Permissions('user:manage')
  @Audit('user.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserInput,
  ) {
    return this.users.update(requireTenant(user), id, user.id, dto);
  }

  @Post(':id/active')
  @Permissions('user:manage')
  @Audit('user.set-active')
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setUserActiveSchema)) dto: SetUserActiveInput,
  ) {
    return this.users.setActive(requireTenant(user), id, user.id, dto.isActive);
  }

  @Post(':id/password')
  @Permissions('user:manage')
  @Audit('user.reset-password')
  @HttpCode(204)
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput,
  ): Promise<void> {
    await this.users.resetPassword(requireTenant(user), id, dto.password);
  }
}
