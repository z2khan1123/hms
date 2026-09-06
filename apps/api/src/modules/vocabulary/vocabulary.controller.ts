import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type CreateFindingInput,
  type CreateSymptomInput,
  type FindingListFilter,
  type Icd10SearchFilter,
  type SymptomListFilter,
  type SymptomTypeInput,
  type UpdateFindingInput,
  type UpdateSymptomInput,
  VocabularyService,
} from './vocabulary.service.js';

// The clinical vocabulary is tenant-editable master data; @hms/shared only
// carries its read shapes, so the write shapes are defined here.
const symptomTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const createSymptomInputSchema = z.object({
  symptomTypeId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});
const updateSymptomInputSchema = createSymptomInputSchema.partial();

const createFindingInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});
const updateFindingInputSchema = createFindingInputSchema.partial();

const symptomListQuerySchema = z.object({
  symptomTypeId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
});
const findingListQuerySchema = z.object({
  category: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
});
const icd10QuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
});

@Controller('vocabulary')
export class VocabularyController {
  constructor(private readonly vocabulary: VocabularyService) {}

  // --- symptom types -------------------------------------------------------

  @Get('symptom-types')
  @Permissions('vocabulary:read')
  listSymptomTypes(@CurrentUser() user: AuthUser) {
    return this.vocabulary.listSymptomTypes(requireTenant(user));
  }

  @Post('symptom-types')
  @Permissions('vocabulary:manage')
  createSymptomType(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(symptomTypeInputSchema))
    dto: SymptomTypeInput,
  ) {
    return this.vocabulary.createSymptomType(requireTenant(user), dto);
  }

  @Patch('symptom-types/:id')
  @Permissions('vocabulary:manage')
  updateSymptomType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(symptomTypeInputSchema))
    dto: SymptomTypeInput,
  ) {
    return this.vocabulary.updateSymptomType(requireTenant(user), id, dto);
  }

  @Delete('symptom-types/:id')
  @Permissions('vocabulary:manage')
  @HttpCode(204)
  async removeSymptomType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.vocabulary.removeSymptomType(requireTenant(user), id);
  }

  // --- symptoms ------------------------------------------------------------

  @Get('symptoms')
  @Permissions('vocabulary:read')
  listSymptoms(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(symptomListQuerySchema))
    query: SymptomListFilter,
  ) {
    return this.vocabulary.listSymptoms(requireTenant(user), query);
  }

  @Post('symptoms')
  @Permissions('vocabulary:manage')
  createSymptom(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSymptomInputSchema))
    dto: CreateSymptomInput,
  ) {
    return this.vocabulary.createSymptom(requireTenant(user), dto);
  }

  @Patch('symptoms/:id')
  @Permissions('vocabulary:manage')
  updateSymptom(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSymptomInputSchema))
    dto: UpdateSymptomInput,
  ) {
    return this.vocabulary.updateSymptom(requireTenant(user), id, dto);
  }

  @Delete('symptoms/:id')
  @Permissions('vocabulary:manage')
  @HttpCode(204)
  async removeSymptom(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.vocabulary.removeSymptom(requireTenant(user), id);
  }

  // --- findings ------------------------------------------------------------

  @Get('findings')
  @Permissions('vocabulary:read')
  listFindings(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(findingListQuerySchema))
    query: FindingListFilter,
  ) {
    return this.vocabulary.listFindings(requireTenant(user), query);
  }

  @Post('findings')
  @Permissions('vocabulary:manage')
  createFinding(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createFindingInputSchema))
    dto: CreateFindingInput,
  ) {
    return this.vocabulary.createFinding(requireTenant(user), dto);
  }

  @Patch('findings/:id')
  @Permissions('vocabulary:manage')
  updateFinding(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFindingInputSchema))
    dto: UpdateFindingInput,
  ) {
    return this.vocabulary.updateFinding(requireTenant(user), id, dto);
  }

  @Delete('findings/:id')
  @Permissions('vocabulary:manage')
  @HttpCode(204)
  async removeFinding(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.vocabulary.removeFinding(requireTenant(user), id);
  }

  // --- ICD-10 --------------------------------------------------------------

  @Get('icd10-groups')
  @Permissions('vocabulary:read')
  listIcd10Groups() {
    return this.vocabulary.listIcd10Groups();
  }

  @Get('icd10-codes')
  @Permissions('vocabulary:read')
  searchIcd10Codes(
    @Query(new ZodValidationPipe(icd10QuerySchema)) query: Icd10SearchFilter,
  ) {
    return this.vocabulary.searchIcd10Codes(query);
  }
}
