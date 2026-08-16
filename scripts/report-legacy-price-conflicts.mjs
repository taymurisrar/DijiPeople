#!/usr/bin/env node
/**
 * Report disagreements between legacy Plan pricing and authoritative PlanPrice.
 *
 * The commercial-configuration migration backfills legacy `Plan.monthlyBasePrice`
 * / `annualBasePrice` into `PlanPrice`, but it deliberately **skips** any plan
 * that already has a price for that currency and cycle — a hand-authored price
 * outranks a generated one.
 *
 * That skip is the right behaviour and also the dangerous one: it is exactly
 * where the two models disagree, and picking a winner automatically would be
 * choosing what a customer pays without anyone deciding. This script surfaces
 * those cases instead. Read-only — it changes nothing.
 *
 * Exit codes:
 *   0  no conflicts (or only informational rows)
 *   1  at least one AMOUNT_CONFLICT — a human must decide
 *   2  could not connect / query
 *
 * Usage:
 *   node scripts/report-legacy-price-conflicts.mjs
 *   node scripts/report-legacy-price-conflicts.mjs --json
 */

import { PrismaClient } from "@prisma/client";

const asJson = process.argv.includes("--json");
const prisma = new PrismaClient();

// A tolerance is deliberate: Decimal(12,2) round-trips can differ in the last
// place, and flagging 1499.99 vs 1500.00 as a commercial conflict would train
// people to ignore the report.
const AMOUNT_TOLERANCE = 0.01;

function classify(plan, price) {
  if (!price) {
    return plan.legacyAmount > 0
      ? { kind: "MISSING_AUTHORITATIVE_PRICE", severity: "high" }
      : { kind: "UNPRICED", severity: "info" };
  }

  if (price.backfilledFromLegacyAt) {
    return { kind: "BACKFILLED_FROM_LEGACY", severity: "info" };
  }

  if (plan.legacyAmount <= 0) {
    return { kind: "AUTHORITATIVE_ONLY", severity: "info" };
  }

  // Legacy amounts are flat per-plan; PlanPrice may be per-seat. Comparing them
  // numerically is only meaningful for FLAT prices — for PER_SEAT the two are
  // different units, which is itself worth reporting rather than "resolving".
  if (price.billingModel === "PER_SEAT") {
    return { kind: "UNIT_MISMATCH_FLAT_VS_PER_SEAT", severity: "high" };
  }

  const delta = Math.abs(Number(price.unitAmount) - plan.legacyAmount);
  if (delta > AMOUNT_TOLERANCE) {
    return { kind: "AMOUNT_CONFLICT", severity: "high" };
  }

  return { kind: "AGREES", severity: "info" };
}

async function main() {
  const plans = await prisma.plan.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      currency: true,
      monthlyBasePrice: true,
      annualBasePrice: true,
      legacyPricingMigratedAt: true,
      prices: {
        select: {
          id: true,
          billingCycle: true,
          billingModel: true,
          currency: true,
          unitAmount: true,
          publicationStatus: true,
          backfilledFromLegacyAt: true,
          marketId: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const rows = [];

  for (const plan of plans) {
    for (const [cycle, legacyAmount] of [
      ["MONTHLY", Number(plan.monthlyBasePrice)],
      ["ANNUAL", Number(plan.annualBasePrice)],
    ]) {
      const price =
        plan.prices.find(
          (candidate) =>
            candidate.billingCycle === cycle &&
            candidate.currency.toUpperCase() === plan.currency.toUpperCase(),
        ) ?? null;

      const verdict = classify({ legacyAmount }, price);

      rows.push({
        planKey: plan.key,
        planName: plan.name,
        billingCycle: cycle,
        currency: plan.currency,
        legacyAmount,
        authoritativeAmount: price ? Number(price.unitAmount) : null,
        billingModel: price?.billingModel ?? null,
        publicationStatus: price?.publicationStatus ?? null,
        marketScoped: price ? Boolean(price.marketId) : null,
        ...verdict,
      });
    }
  }

  const conflicts = rows.filter((row) => row.severity === "high");

  if (asJson) {
    console.log(JSON.stringify({ rows, conflictCount: conflicts.length }, null, 2));
  } else {
    console.log("Legacy vs authoritative pricing\n");
    for (const row of rows) {
      const marker = row.severity === "high" ? "!" : " ";
      const authoritative =
        row.authoritativeAmount === null
          ? "—"
          : `${row.authoritativeAmount} (${row.billingModel})`;
      console.log(
        `${marker} ${row.planKey.padEnd(12)} ${row.billingCycle.padEnd(8)} ` +
          `${row.currency}  legacy=${String(row.legacyAmount).padEnd(9)} ` +
          `authoritative=${String(authoritative).padEnd(18)} ${row.kind}`,
      );
    }
    console.log(
      `\n${rows.length} plan/cycle combination(s); ${conflicts.length} needing a decision.`,
    );
    if (conflicts.length > 0) {
      console.log(
        "\nNothing was changed. Each row marked ! is a case where the two models\n" +
          "disagree and no automatic winner is correct — set the authoritative\n" +
          "PlanPrice deliberately in Platform Admin.",
      );
    }
  }

  return conflicts.length > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("Could not report legacy price conflicts:", error.message);
    await prisma.$disconnect();
    process.exit(2);
  });
