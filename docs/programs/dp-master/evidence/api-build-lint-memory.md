# API build and lint memory: diagnosis (ITEM-0249)

Node v22.23.4 (win-x64), TypeScript 5.9.2, `services/api`. Date 2026-11-28.
Outcome: **no config change made.** No reduction was found that keeps checking identical. The CI heap setting (`--max-old-space-size=6144` for Build and ESLint services/api) stays.

## Conditions
Not isolated. Other agents were running throughout; `tasklist` showed 4 to 7 node.exe processes, with other sessions holding 3 to 5.7 GB working set each, and bash fork failures occurred mid-session. Pass/fail on a fixed `--max-old-space-size` is therefore the only reliable signal; wall-clock times are inflated.

## (a) tsc, `tsconfig.build.json` (`--noEmit --incremental false --extendedDiagnostics`)
| Metric | Value |
|---|---|
| Files | 3003 (1025 under `src/`, 27 `prisma/*.ts` + `prisma.config.ts`, 1944 in node_modules, 5 `packages/config` d.ts) |
| Lines of definitions (.d.ts) | 1,698,463 |
| Lines of TypeScript | 341,171 |
| Types | 2,171,238 |
| Symbols | 4,207,637 |
| Instantiations | 11,753,733 |
| Memory used | 4,216,376 K (about 4.0 GiB) |
| Check time | 154 s (203 s total, loaded machine) |

Definition lines by package (from `--listFilesOnly`):
| Package | .d.ts lines | Files |
|---|---|---|
| `.prisma/client` (generated, 344 models) | 1,423,745 | 2 |
| stripe | 110,658 | 222 |
| @types/node | 55,454 | 66 |
| typescript lib | 51,301 | 58 |
| @aws-sdk/client-s3 | 42,194 | 139 |
| rxjs, @nestjs/common, @smithy/* | under 8,000 each | |

**The generated Prisma client is 84% of all definition lines and about 40% of every line the compiler reads.** That is what sets the floor. It is used by nearly every service, so it cannot be dropped, narrowed or replaced without changing what is checked.

Checked and found not to be contributors:
- Spec and test files are already excluded: `tsconfig.build.json` excludes `test`, `**/*.spec.ts`; `--listFilesOnly` shows none in the build program.
- `types: ["node","jest"]` is explicit (no `@types/*` sweep). The jest family is 9 files and 3,854 lines, 0.2% of definitions. Dropping it would save almost nothing, and every non-spec file that mentions `jest`/`expect` is a plain word match, not verified as unused, so it was not changed.
- No duplicated node_modules copies were observed in the top contributors (`@types/node` once; `undici-types` once).
- `prisma/**/*.ts` (27 seed/backfill scripts) are in the build program, and `nest build` emits them. Excluding them would change build output, so it is not a pure memory change; they also share the same Prisma client so the saving would be small.
- `incremental` does not help a cold CI build (no tsbuildinfo on a fresh checkout); the build config already sets it false.

`--generateTrace` failed: the run took 10.5 min and crashed writing `types.json` (477 MB partial, `write` error) on the loaded machine. The trace was deleted from the scratchpad. The package breakdown above comes from `--listFilesOnly` line counts, which is sufficient to identify the dominant contributor.

Heap bisect, build: carried over from `api-build-memory.md` (nest build, same Node): 3072 MB FAIL, 4096 MB PASS. Not re-run, because nothing was changed; the tsc "Memory used" of 4.2 GiB above is consistent with that threshold sitting between 3 and 4 GB.

## (b) ESLint (`eslint.config.mjs`)
- Config uses `tseslint.configs.recommendedTypeChecked` with `parserOptions.projectService: true`, so the preferred typed-linting mode is already on.
- The command lints `{src,test}/**/*.ts`. Each file resolves to the nearest `tsconfig.json`, whose `include` is `src`, `test`, `prisma`, `prisma.config.ts`: **one program holds src, specs and test together**, plus the Prisma client. Splitting src and test into two programs would load the 1.4M-line Prisma client into two type-checkers and raise peak memory, not lower it, so it was not tried.
- `TIMING=1` rule cost at 6144 MB (total about 295 s of rule time):
  | Rule | Time | Share |
  |---|---|---|
  | @typescript-eslint/no-misused-promises | 69.8 s | 23.7% |
  | prettier/prettier | 67.4 s | 22.8% |
  | @typescript-eslint/no-unsafe-assignment | 51.5 s | 17.5% |
  | @typescript-eslint/no-unsafe-return | 34.6 s | 11.7% |
  | @typescript-eslint/no-floating-promises | 28.2 s | 9.6% |
  The cost is type-aware rules querying the shared checker; they dominate time, but memory is the program itself (same Prisma-dominated program as tsc). Disabling any of them would weaken lint, so none was touched.
- Heap bisect, lint (exit codes, 1 run each, full `{src,test}` with `--max-warnings=787`):
  | Heap | Result |
  |---|---|
  | 3072 MB | FAIL, exit 134 (V8 OOM) |
  | 4096 MB | PASS, exit 0 (7 m 09 s) |
  | 6144 MB | PASS, exit 0 (7 m 10 s) |
  Smallest passing tested: 4096 MB; the threshold is between 3072 and 4096 (3584 not tried). Before and after are identical because no change was made.

## (c) Changes made
None. `eslint --print-config` before/after diff is therefore empty by construction; `services/api/tsconfig*.json`, `services/api/eslint.config.mjs` and `ci.yml` are unmodified.

Reductions that would work but are outside "identical checking", for the owner to decide:
1. Prisma client size: the generated client is the floor. Options are a smaller schema surface per service or splitting the API, both architectural.
2. A larger CI/Render heap (already done in CI at 6144). Render's build command sets no NODE_OPTIONS; a 4096 MB heap is the measured minimum, and the Node default is about 4144 MB on a 31 GB machine but depends on the build machine's RAM.

## (d) Render limits (read-only)
- `render.yaml`: service `dijipeople-api`, `plan: standard`, `buildCommand: npm ci && npm --workspace api run build`, no NODE_OPTIONS.
- Live Render API / CLI was **not queried**. The attempt to read the Render token from the Windows User environment variable was denied by the session's permission classifier, so no GET was made and no live plan, memory or build-log information was obtained. The live plan and memory figure remain unverified; Render Standard is documented as 2 GB RAM, which is below the 4 GB heap that the build needs, so confirm that the build step has more memory than the instance plan (build and runtime limits may differ) before relying on the 4096 MB figure there.
