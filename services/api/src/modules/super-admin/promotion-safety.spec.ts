import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE = join(__dirname, 'super-admin.service.ts');
const MANAGER = join(
  __dirname,
  '../../../../../apps/admin/app/_components/promotions-manager.tsx',
);

/*
 * Read with line endings normalised.
 *
 * A sibling spec asserted against a literal containing a newline and passed
 * trivially on a Windows checkout while failing on CI's LF one — where it then
 * turned out to be right, having found a second defect the local run could not
 * see. Same class as BUG-1208. Normalising means these assertions mean the same
 * thing on both platforms.
 */
function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * BUG-1751 — one press published a 10% discount against every subscription.
 *
 * The Discounts and promotions form defaulted Scope to "All eligible
 * subscriptions", pre-filled Percent off with 10, and created the promotion
 * Active. There was no draft state and no confirmation, so "Add promotion" with
 * the form's own defaults was a complete, live commercial term.
 *
 * The feature was never broken. This is about how easy it was to publish
 * commercial terms by accident.
 */
describe('BUG-1751 — creating a promotion is not publishing one', () => {
  const service = normalized(SERVICE);

  it('creates promotions inactive', () => {
    const code = service
      .slice(
        service.indexOf('async createPromotion('),
        service.indexOf('async updatePromotion('),
      )
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain('isActive: dto.isActive ?? false');
  });

  it('still lets a caller state activation deliberately', () => {
    /*
     * `?? false` rather than a hard `false`: a caller that says
     * `isActive: true` has said something, and this record is about defaults
     * rather than about removing the capability.
     */
    const code = service.slice(
      service.indexOf('async createPromotion('),
      service.indexOf('async updatePromotion('),
    );
    expect(code).toContain('dto.isActive ??');
  });
});

describe('BUG-1751 — the form asks rather than assumes', () => {
  const manager = normalized(MANAGER);

  it('does not default the scope to the widest one', () => {
    const draft = manager.slice(
      manager.indexOf('const emptyDraft: PromotionDraft = {'),
      manager.indexOf('export function PromotionsManager('),
    );
    expect(draft).not.toContain('scope: "GLOBAL"');
    expect(draft).toContain('scope: "" as PromotionDraft["scope"]');
  });

  it('does not pre-fill a discount amount', () => {
    // 10 was a number nobody chose, on a field that sets commercial terms.
    const draft = manager.slice(
      manager.indexOf('const emptyDraft: PromotionDraft = {'),
      manager.indexOf('export function PromotionsManager('),
    );
    expect(draft).not.toContain('value: "10"');
    expect(draft).toContain('value: ""');
  });

  it('refuses to submit without a scope and a value', () => {
    expect(manager).toContain('Choose what this promotion applies to.');
    expect(manager).toMatch(/Enter the (percentage|amount) to discount\./);
  });

  it('offers an explicit activation, and confirms it', () => {
    // Promotions are created inactive, so there has to be a deliberate way to
    // turn one on — and turning on a global discount is what used to happen by
    // accident, so it asks first.
    expect(manager).toContain('function activate(');
    expect(manager).toContain('Activate promotion');
    expect(manager).toContain('every eligible subscription');
  });

  it('treats a global activation as the dangerous case', () => {
    expect(manager).toMatch(
      /tone:\s*promotion\.scope === "GLOBAL" \? "danger" : "default"/,
    );
  });
});

/**
 * BUG-1745 — the dashboard reported a confident zero.
 *
 * Every money aggregate filters on `currency: reportingCurrency`, and
 * production's stored default said PKR while every payment, invoice and price
 * was QAR. "Collected revenue PKR 0" is indistinguishable, on the screen, from
 * having earned nothing — and there were two succeeded payments totalling
 * QAR 160.
 *
 * Which currency the business reports in is a commercial decision and is not
 * fixed here. What is fixed is a zero meaning two different things.
 */
describe('BUG-1745 — a zero says which kind of zero it is', () => {
  const service = normalized(SERVICE);

  it('counts payments in every currency, not only the reporting one', () => {
    expect(service).toContain('paymentsByCurrency');
    expect(service).toMatch(
      /payment\.groupBy\(\{[\s\S]{0,200}by: \['currency'\]/,
    );
  });

  it('reports what the filter excluded', () => {
    expect(service).toContain('excludedCurrencies: excludedCurrencyTotals');
    expect(service).toContain(
      'filter((row) => row.currency !== reportingCurrency)',
    );
  });

  it('carries the amounts, not just the currency codes', () => {
    // "Excludes QAR" invites the question "how much?". The answer travels with
    // it so the screen can answer without another request.
    const derivation = service.slice(
      service.indexOf('const excludedCurrencyTotals'),
      service.indexOf('const excludedCurrencyTotals') + 600,
    );
    expect(derivation).toContain('collected:');
    expect(derivation).toContain('payments:');
  });
});
