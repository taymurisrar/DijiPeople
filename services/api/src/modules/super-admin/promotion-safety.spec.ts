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
 * Every money aggregate filtered on `currency: reportingCurrency`, and
 * production's stored default said PKR while every payment, invoice and price
 * was QAR. "Collected revenue PKR 0" is indistinguishable, on the screen, from
 * having earned nothing — and there were two succeeded payments totalling
 * QAR 160.
 *
 * The first fix made that zero *honest*: the screen listed the currencies it
 * had left out. This suite used to assert exactly that, and those assertions
 * are gone because the behaviour is — on 2026-08-28 the repository owner asked
 * for the money to be converted and counted instead, with rates maintained in
 * Settings. What survives is the property both fixes were for, and it is
 * stronger now: **no money is silently absent from a total**.
 *
 * The arithmetic itself is covered by `dashboard-fx.spec.ts` and
 * `platform-fx.service.spec.ts`, which run it rather than read it. What is
 * checked here is that the filter has not come back.
 */
describe('BUG-1745 — no money is silently absent from a total', () => {
  const service = normalized(SERVICE);

  it('groups money by currency instead of filtering to one', () => {
    expect(service).toContain('paymentsByCurrency');
    expect(service).toMatch(
      /payment\.groupBy\(\{[\s\S]{0,200}by: \['currency'\]/,
    );
  });

  it('has no money aggregate filtered to the reporting currency', () => {
    /*
     * The regression this file exists to catch. Reintroducing
     * `currency: reportingCurrency` in a `where` is what produced the confident
     * zero, and it is a single line somebody could add back while "restoring"
     * a filter that looks like it belongs.
     */
    expect(service).not.toContain('currency: reportingCurrency');
    expect(service).not.toContain('currencyCode: reportingCurrency');
  });

  it('converts through one shared converter, so every figure uses one rate', () => {
    expect(service).toContain('await this.fx.loadConverter(reportingCurrency)');
    expect(service).toContain('fx.convert');
  });

  it('names money it cannot convert rather than dropping or par-counting it', () => {
    // A currency with no rate must reach the screen as itself. Counting it at
    // par would make QAR 160 read as PKR 160 with nothing to say so.
    expect(service).toContain('unconvertible');
    expect(service).toContain('foldCurrencies');
  });
});
