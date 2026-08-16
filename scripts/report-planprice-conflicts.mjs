#!/usr/bin/env node
/**
 * Diagnose PlanPrice rows that collide, or would collide, under the active-price
 * uniqueness rule.
 *
 * Written for BUG-0030. The production failure was an insert violating
 * `PlanPrice_active_plan_cycle_currency_key` — a partial unique index on
 * `(planId, billingCycle, currency) WHERE isActive = true` that predates markets
 * and therefore cannot tell two markets apart.
 *
 * This script changes nothing. It exists because the rule in this repository is
 * that production data is not repaired before it is understood: a duplicate may
 * be an accident, or it may be legitimate version history, a legitimate
 * market variation, or a legacy row from before markets existed. Deleting rows
 * to make an exception disappear would destroy commercial history.
 *
 * Exit codes:
 *   0  nothing needing a human decision
 *   1  at least one MULTIPLE_ACTIVE or UNKNOWN group
 *   2  could not connect / query
 *
 * Usage:
 *   node scripts/report-planprice-conflicts.mjs
 *   node scripts/report-planprice-conflicts.mjs --json
 */

import { PrismaClient } from "@prisma/client";

const asJson = process.argv.includes("--json");
const prisma = new PrismaClient();

function classify(group) {
  const active = group.rows.filter((row) => row.isActive);
  const markets = new Set(group.rows.map((row) => row.marketId ?? "(none)"));
  const activeMarkets = new Set(active.map((row) => row.marketId ?? "(none)"));

  // More than one active row for the same plan/cycle/currency is the shape that
  // actually breaks. Whether it is legitimate depends on the markets involved.
  if (active.length > 1) {
    return activeMarkets.size === active.length
      ? {
          kind: "LEGITIMATE_MARKET_VARIATION",
          severity: "info",
          note: "One active price per market. Valid once the index includes marketId.",
        }
      : {
          kind: "MULTIPLE_ACTIVE",
          severity: "high",
          note: "Two or more active prices share a market. Only one can serve checkout.",
        };
  }

  if (active.length === 1 && active[0].marketId === null) {
    return {
      kind: "LEGACY_MIGRATION_COLLISION",
      severity: "warn",
      note: "The active price has no market, so no market can resolve it. Scope it in Admin.",
    };
  }

  const drafts = group.rows.filter(
    (row) => row.publicationStatus === "DRAFT" && !row.isActive,
  );

  if (active.length === 0 && drafts.length > 0) {
    return {
      kind: "MISSING_ACTIVE_PRICE",
      severity: "warn",
      note: "Only drafts exist, so nothing is purchasable for this slot.",
    };
  }

  if (group.rows.length > 1 && active.length <= 1) {
    return {
      kind: "LEGITIMATE_VERSION_HISTORY",
      severity: "info",
      note: `${group.rows.length} versions, ${active.length} active.`,
    };
  }

  if (markets.has("(none)") && markets.size > 1) {
    return { kind: "MISSING_MARKET", severity: "warn", note: "Some rows are unscoped." };
  }

  return { kind: "OK", severity: "info", note: "" };
}

async function main() {
  const prices = await prisma.planPrice.findMany({
    select: {
      id: true,
      planId: true,
      marketId: true,
      billingCycle: true,
      currency: true,
      unitAmount: true,
      version: true,
      isActive: true,
      publicationStatus: true,
      effectiveFrom: true,
      effectiveTo: true,
      backfilledFromLegacyAt: true,
      plan: { select: { key: true } },
      market: { select: { code: true } },
    },
    orderBy: [{ planId: "asc" }, { billingCycle: "asc" }, { version: "asc" }],
  });

  // Group by the key the database's partial index actually enforces.
  const groups = new Map();
  for (const price of prices) {
    const key = `${price.planId}|${price.billingCycle}|${price.currency.toUpperCase()}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push(price);
    else
      groups.set(key, {
        planKey: price.plan?.key ?? price.planId,
        billingCycle: price.billingCycle,
        currency: price.currency.toUpperCase(),
        rows: [price],
      });
  }

  const report = [...groups.values()].map((group) => ({
    ...group,
    ...classify(group),
    rows: group.rows.map((row) => ({
      id: row.id,
      market: row.market?.code ?? null,
      version: row.version,
      isActive: row.isActive,
      publicationStatus: row.publicationStatus,
      unitAmount: Number(row.unitAmount),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      backfilled: Boolean(row.backfilledFromLegacyAt),
    })),
  }));

  const needsDecision = report.filter((group) => group.severity === "high");
  const warnings = report.filter((group) => group.severity === "warn");

  if (asJson) {
    console.log(
      JSON.stringify(
        { groups: report, needsDecision: needsDecision.length, warnings: warnings.length },
        null,
        2,
      ),
    );
  } else {
    console.log(`PlanPrice uniqueness diagnostic — ${prices.length} row(s)\n`);
    for (const group of report) {
      if (group.kind === "OK") continue;
      const marker = group.severity === "high" ? "!" : group.severity === "warn" ? "?" : " ";
      console.log(
        `${marker} ${group.planKey.padEnd(12)} ${group.billingCycle.padEnd(8)} ${group.currency}  ${group.kind}`,
      );
      if (group.note) console.log(`    ${group.note}`);
      for (const row of group.rows) {
        console.log(
          `    - v${row.version} ${row.publicationStatus.padEnd(9)} ` +
            `${row.isActive ? "active  " : "inactive"} market=${row.market ?? "(none)"} ` +
            `amount=${row.unitAmount}${row.backfilled ? " [backfilled]" : ""}`,
        );
      }
    }
    console.log(
      `\n${report.length} slot(s); ${needsDecision.length} needing a decision, ${warnings.length} warning(s).`,
    );
    if (needsDecision.length > 0) {
      console.log(
        "\nNothing was changed. Rows marked ! have two active prices in one market —\n" +
          "only one can serve checkout, and which one survives is a commercial\n" +
          "decision. Resolve it in Platform Admin.",
      );
    }
  }

  return needsDecision.length > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("Could not diagnose PlanPrice conflicts:", error.message);
    await prisma.$disconnect();
    process.exit(2);
  });
