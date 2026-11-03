# Production advisory review — 2026-11-03

Branch `agent/security-advisory-remediation`, base `origin/develop` @ `214433c1`. Source of truth: `npm audit --omit=dev` on `package-lock.json`, and `scripts/check-production-advisories.mjs` (the required CI gate). Verified on Node 22.23.4 / npm 11.9.0 after a clean `npm ci`.

## Result

| | Before | After |
|---|---|---|
| Critical | 1 (`next`) | **0** |
| High | 8 | 7 (all dispositioned: prisma CLI chain, xlsx) |
| Moderate / low | 17 / 1 | 12 / 0 |
| Gate: undispositioned | 20 | **10** (all moderate, see "Needs an owner decision") |

## Fixed in this branch (23 lockfile entries moved; nothing else)

| Package | From → To | Advisory | Path | How |
|---|---|---|---|---|
| **next** | 16.3.8 → 16.4.4 | CRITICAL unauthenticated RCE (image optimizer / server actions), DoS | `web`, `admin`, `landing`, `docs` | in-range `npm update`; `@next/*` SWC binaries follow |
| multer | 2.4.0 → 2.5.0 | HIGH DoS (pending async iterator) | `api` → `@nestjs/platform-express` (pins 2.4.0 exactly) | root `overrides` + lockfile entry from registry metadata; same dependency set as 2.4.0. Verified by `check-overrides-applied` |
| body-parser | 2.3.0 → 2.4.0 | HIGH DoS (trailing bytes) | `api` → `express` | in-range |
| nodemailer | 10.0.15 → 10.3.1 | moderate (address parser) | `api` direct | in-range |
| sanitize-html | 2.17.7 → 2.18.1 | moderate (2.18.0 is still affected) | `api` direct | in-range |
| qs | 6.16.0 → 6.17.1 | moderate | express | in-range |
| fast-uri | 3.1.8 → 3.1.9 | moderate | ajv chain | in-range (4.x is a major, not needed) |
| ip-address | 10.7.3 → 10.7.5 | moderate | express chain | in-range |

Also removed: three **stale dispositions** (`mammoth`, `argparse`, `sprintf-js`) that matched no advisory any more; the gate itself required it.

Not done, deliberately: `npm audit fix` (it re-resolved the whole lockfile — 7,400 lines, pulling in unrelated packages — because the tree cannot be freshly resolved while the `@tiptap` peer conflict exists, BUG-0163; I discarded that and made targeted changes); merging any of the 13 Dependabot PRs (all target `main`); touching `.github`, `next` majors, or `@nestjs` 11 → 12.

**Lockfile caveat.** npm reports "up to date" and ignores a new `overrides` entry on this tree, so the `multer` resolution was written into the lockfile by hand from the registry's `dist` metadata. `check-overrides-applied` reports it applied and `npm ci` installs `multer@2.5.0`, but `npm ls` shows it as "invalid" against `@nestjs/platform-express`'s exact pin. A future `npm install` that can resolve fresh may rewrite it; the override entry makes that rewrite land on 2.5.0.

## Needs an owner decision — 10 moderate advisories, no safe fix

All are build/packaging tooling reachable only through two dependencies. **None is exploitable through this product's own code paths** (evidence below), and none has an upstream fix that is not a major downgrade or an unverified major migration. The gate stays red for these until you approve one of the options; I have not added dispositions.

### A. `exceljs@4.4.0` chain — `archiver`, `archiver-utils`, `zip-stream`, `readdir-glob`, `glob`, `minimatch`, `rimraf` (api)
- Advisories: glob AbortSignal bypass; minimatch DoS via pattern amplification; rimraf via glob. Severity moderate. Attack needs an attacker-controlled **glob pattern**.
- Exposure: `archiver` is `require`d by exceljs in exactly one file, `lib/stream/xlsx/workbook-writer.js` (the streaming writer). This repository never uses `WorkbookWriter` (`grep` over `services/api/src` finds none), and nothing calls `archiver.glob()/directory()/file()`, the only paths that take a pattern. `rimraf` arrives through `unzipper → fstream`, whose cleanup runs on extraction to disk, which is never used.
- Fix status: npm's suggestion is `exceljs@3.4.0`, a four-major **downgrade** (already rejected for `exceljs`/`uuid` under BUG-0052). `glob >= 14.0.2` and `minimatch >= 11` are brand-new majors that `archiver-utils` cannot take.
- Proposed (needs approval): disposition of the seven packages with the same reasoning as the existing `exceljs` entry, with a removal trigger of "exceljs replaced or archiver >= 8".

### B. `active-win@8.2.1` chain — `node-gyp`, `make-fetch-happen`, `cacache` (+ `glob`/`minimatch` copies) (agent-desktop)
- Advisories: moderate (DoS in tooling dependencies). Severity moderate.
- Exposure: `active-win@8` lists `node-gyp ^9.3.0` as a **runtime** dependency although it is only a native-build fallback (`node-pre-gyp install --fallback-to-build`). Nothing in `apps/agent-desktop/src` imports `node-gyp`, `cacache` or `make-fetch-happen`. They are present in the installed tree and may be bundled into the installer but are not executed by the agent.
- Fix available but **not applied**: `active-win@9.0.0` declares **no dependencies at all**, which removes the whole chain at the source. It is a major: pure ESM with **named** exports (`activeWindow`) and no default export. The agent's two call sites use `const { default: activeWin } = await import("active-win")`, so they would need `const { activeWindow } = await import("active-win")`. The fields the agent reads (`title`, `owner.name`, `owner.path`, `owner.processId`) are unchanged in v9's types, and both sites already degrade to "unknown foreground" on error. Why not applied: the agent compiles to CommonJS, where a dynamic `import()` of an ESM-only package may be transpiled into `require()` and fail on a given Electron/Node combination, and I could not verify it on a real desktop agent. The failure mode is lost telemetry rather than a crash, but that is still a behaviour change in a shipped endpoint agent.
- Options: (1) approve a disposition now with the evidence above, then migrate to `active-win@9` as planned work verified on a real device; (2) migrate now (small code change + a manual check on Windows and macOS builds) and the three-package disposition becomes unnecessary.

## Not fixable here, already dispositioned (unchanged)
`prisma` CLI chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`), `xlsx` (no fix exists; every read call site already moved to ExcelJS), `exceljs`, `uuid` — each has a written, argued entry in the gate script (BUG-0052).

## Compatibility evidence
- `npm ci` clean on Node 22.23.4 / npm 11.9.0: 1,609 packages.
- `npm run typecheck` (turbo, all workspaces) pass; `check-overrides-applied`, `check-declared-dependencies` pass.
- Tests: web, admin, landing pass; API 8,476 / 8,477 — the one failure is the MFA TOTP-timing test, root-caused separately (QR rendering cost vs a 5 s timeout) and fixed on the module branch.
- `npm run build` (turbo, 6 tasks incl. web/admin/landing/docs on Next 16.4.4): pass, 8 m 50 s.
- Not run: browser e2e against Next 16.4.4 (CI's Browser e2e job covers it on the PR), and any smoke on deployed infrastructure.

## Rollback
Revert the single dependency commit (`package.json`, `package-lock.json`, the gate script edit). No migration, no data change, no config change. Because `next` is a minor within 16.x and the others are in-range patch/minor bumps, there is no format or schema compatibility concern.
