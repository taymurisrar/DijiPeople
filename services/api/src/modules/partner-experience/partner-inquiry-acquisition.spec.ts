import { PartnerType, PartnershipModel } from '@prisma/client';
import {
  PARTNERSHIP_MODEL_OPTIONS,
  isPartnershipModel,
} from '../leads/acquisition.catalog';

/**
 * ITEM-0030 — the partnership model is a distinct fact from the entity type.
 *
 * `PartnerType` is `{ INDIVIDUAL, COMPANY }` — how the counterparty contracts.
 * It cannot express whether they want to refer customers, resell, implement or
 * integrate, so before this every partnership inquiry arrived commercially
 * indistinguishable from every other.
 *
 * These assertions pin that the two stay separate, that every model the form
 * offers is one the database can store, and that no option leaks a raw enum
 * name into the UI.
 */
describe('partner inquiry acquisition contract', () => {
  it('keeps the partnership model separate from the contracting entity type', () => {
    // If these ever overlap, one has been overloaded into the other.
    const entityTypes = new Set<string>(Object.values(PartnerType));
    const models = new Set<string>(Object.values(PartnershipModel));

    for (const model of models) {
      expect(entityTypes.has(model)).toBe(false);
    }
    for (const entityType of entityTypes) {
      expect(models.has(entityType)).toBe(false);
    }
  });

  it('offers only models the database can store', () => {
    for (const option of PARTNERSHIP_MODEL_OPTIONS) {
      expect(Object.values(PartnershipModel)).toContain(option.value);
    }
  });

  it('covers every model the enum defines, so none is unreachable', () => {
    const offered = new Set(PARTNERSHIP_MODEL_OPTIONS.map((o) => o.value));
    for (const value of Object.values(PartnershipModel)) {
      expect(offered.has(value)).toBe(true);
    }
  });

  it('validates membership and rejects an entity type passed as a model', () => {
    expect(isPartnershipModel(PartnershipModel.REFERRAL)).toBe(true);
    expect(isPartnershipModel(PartnershipModel.RESELLER)).toBe(true);
    // The specific confusion this field exists to prevent.
    expect(isPartnershipModel('COMPANY')).toBe(false);
    expect(isPartnershipModel('INDIVIDUAL')).toBe(false);
    expect(isPartnershipModel('')).toBe(false);
    expect(isPartnershipModel(undefined)).toBe(false);
  });

  it('gives every model a human label, never a raw enum name', () => {
    for (const option of PARTNERSHIP_MODEL_OPTIONS) {
      expect(option.label).not.toBe(option.value);
      expect(option.label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it('covers the collaboration intents the business named', () => {
    // Referral, reseller, implementation, technology, strategic and consultant
    // were each named as real partnership routes.
    const values = new Set<string>(Object.values(PartnershipModel));
    for (const expected of [
      'REFERRAL',
      'RESELLER',
      'IMPLEMENTATION',
      'TECHNOLOGY',
      'STRATEGIC',
      'CONSULTANT',
      'OTHER',
    ]) {
      expect(values.has(expected)).toBe(true);
    }
  });
});
