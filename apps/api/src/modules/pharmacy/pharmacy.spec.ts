import { describe, expect, it } from 'vitest';
import {
  type AllergyCandidateMedicine,
  collectAllergyWarnings,
  isBatchExpired,
} from './pharmacy.mapper.js';

/**
 * The allergy check is the safety-critical bit of the pharmacy module: the
 * prescribing screen runs `matchAllergy` from `@hms/shared` locally and this API
 * runs it too, and the two must agree. These lock in what the seeded catalogue
 * is meant to demonstrate.
 */

const CATALOGUE: AllergyCandidateMedicine[] = [
  {
    id: 'amoxicillin',
    name: 'Amoxicillin 500mg',
    genericName: 'Amoxicillin',
    allergenKeywords: ['penicillin', 'amoxicillin'],
  },
  {
    id: 'augmentin',
    name: 'Augmentin 625mg',
    genericName: 'Amoxicillin + Clavulanic acid',
    allergenKeywords: ['penicillin', 'amoxicillin', 'clavulanic acid'],
  },
  {
    id: 'paracetamol',
    name: 'Paracetamol 500mg',
    genericName: 'Paracetamol',
    allergenKeywords: [],
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen 400mg',
    genericName: 'Ibuprofen',
    allergenKeywords: ['nsaid', 'ibuprofen'],
  },
];

describe('collectAllergyWarnings', () => {
  it('warns on every medicine that shares a keyword with a penicillin allergy', () => {
    const warnings = collectAllergyWarnings(CATALOGUE, [
      { substance: 'Penicillin', reaction: 'Hives', severity: 'severe' },
    ]);
    expect(warnings.map((w) => w.medicineId).sort()).toEqual([
      'amoxicillin',
      'augmentin',
    ]);
    expect(warnings[0]).toMatchObject({
      substance: 'Penicillin',
      severity: 'severe',
      reaction: 'Hives',
      matchedKeyword: 'penicillin',
    });
  });

  it('does not warn when nothing collides', () => {
    expect(
      collectAllergyWarnings(CATALOGUE, [
        { substance: 'Sulfa', reaction: null, severity: 'moderate' },
      ]),
    ).toEqual([]);
  });

  it('emits one warning per (medicine, allergy) hit', () => {
    const warnings = collectAllergyWarnings(CATALOGUE, [
      { substance: 'amoxicillin', reaction: null, severity: 'mild' },
      { substance: 'ibuprofen', reaction: null, severity: 'mild' },
    ]);
    // amoxicillin -> Amoxicillin + Augmentin; ibuprofen -> Ibuprofen
    expect(warnings).toHaveLength(3);
  });

  it('returns nothing when there are no recorded allergies', () => {
    expect(collectAllergyWarnings(CATALOGUE, [])).toEqual([]);
  });
});

describe('isBatchExpired', () => {
  const today = new Date('2026-09-07T00:00:00.000Z');

  it('is false for a batch expiring today or later', () => {
    expect(isBatchExpired(new Date('2026-09-07T00:00:00.000Z'), today)).toBe(
      false,
    );
    expect(isBatchExpired(new Date('2027-01-01T00:00:00.000Z'), today)).toBe(
      false,
    );
  });

  it('is true once the expiry date is in the past', () => {
    expect(isBatchExpired(new Date('2026-09-06T00:00:00.000Z'), today)).toBe(
      true,
    );
  });
});
