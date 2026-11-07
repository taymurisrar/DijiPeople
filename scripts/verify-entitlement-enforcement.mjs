#!/usr/bin/env node
/*
 * Release gate: plan-entitlement enforcement must be ON in production (DP-QA-005).
 *
 * Production defaulted to REPORT_ONLY: a Starter tenant could use every paid module
 * and the only trace was a log line. ENFORCE now comes from the
 * `ENTITLEMENT_ENFORCEMENT_MODE` release floor, and this script refuses to let a
 * production release proceed without it. It runs first in `npm run release`
 * (Render's preDeployCommand), before migrations, so a missing or wrong value
 * stops the deploy rather than being discovered afterwards.
 *
 * Three outcomes, nothing silent:
 *   - ENFORCE            -> pass.
 *   - missing / OFF / REPORT_ONLY / malformed -> FAIL (exit 1), unless the operator
 *     sets ENTITLEMENT_ALLOW_UNENFORCED=true, an explicit, logged acknowledgement
 *     for a release that must go out before the cutover (it is printed, not hidden).
 *   - not production     -> skipped; development and CI run REPORT_ONLY on purpose.
 *
 * The running service is checked separately by `npm run smoke:deployment`, which
 * reads `/api/health` -> `entitlementEnforcement.enforced`.
 */
import { pathToFileURL } from "node:url";

export function evaluateEnforcementGate(env) {
  const production = env.NODE_ENV === "production";
  const raw = (env.ENTITLEMENT_ENFORCEMENT_MODE ?? "").trim();
  const acknowledged = env.ENTITLEMENT_ALLOW_UNENFORCED === "true";

  if (!production) {
    return { ok: true, status: "SKIPPED", message: "not a production release" };
  }
  if (raw.toUpperCase() === "ENFORCE" && raw === raw.toUpperCase()) {
    return { ok: true, status: "ENFORCED", message: "ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE" };
  }

  const problem = !raw
    ? "ENTITLEMENT_ENFORCEMENT_MODE is not set, so a fresh database serves paid modules to every plan (REPORT_ONLY)"
    : `ENTITLEMENT_ENFORCEMENT_MODE="${raw}" is not exactly ENFORCE`;
  if (acknowledged) {
    return {
      ok: true,
      status: "ACKNOWLEDGED_UNENFORCED",
      message: `${problem}; released anyway because ENTITLEMENT_ALLOW_UNENFORCED=true`,
    };
  }
  return {
    ok: false,
    status: "NOT_ENFORCED",
    message:
      `${problem}. Set ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE on the service ` +
      "(after `npm run entitlement:grandfather`, ADR-0009), or set " +
      "ENTITLEMENT_ALLOW_UNENFORCED=true to release knowingly without it.",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = evaluateEnforcementGate(process.env);
  const line = `entitlement enforcement gate: ${result.status} - ${result.message}`;
  if (result.ok) {
    (result.status === "ACKNOWLEDGED_UNENFORCED" ? console.warn : console.log)(line);
  } else {
    console.error(line);
    process.exit(1);
  }
}
