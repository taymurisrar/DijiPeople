# Engineering History — Wave 3: Lead + Partner Acquisition

| | |
|---|---|
| **Task Title** | Wave 3 — Lead + Partner Acquisition |
| **Task Type** | FEATURE + BUGFIX + MIGRATION |
| **Date** | 2026-08-16 |
| **Architect Plan** | No separate ExecPlan. The analysis a plan would have carried — the contact and partner mapping matrices, the schema-gap findings, and the reasoning for deferring the partner form — is recorded in the QA run, BUG-0021 and ITEM-0030. The schema change is additive only. |
| **Agents Used** | Architect (schema gaps, mapping matrices, triage), Database (schema, migration, drift check), Backend/API (intake DTO, service, catalogue), Frontend (contact form, options), UI/UX (copy, consent presentation), QA, Reviewer, Integrator. **Deliberately not used:** Release/DevOps — nothing deployed by this task. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/lead-partner-acquisition-wave3` |
| **Base SHA** | `1695167` |
| **Final Task SHA** | `cc8cc1c389bf591f86c2a1a815a3db952c491d5d` |
| **Target Branch** | `main` |
| **Merge Commit** | `ca18353099b6abb9de23549be0586824d1a13db1` (PR #22) |
| **Final Target SHA** | `ca18353099b6abb9de23549be0586824d1a13db1` |

### Commits

```
cc8cc1c merge origin/main and renumber the colliding backlog id
1967750 style: format the Wave 3 acquisition sources with prettier
6fd0c80 docs: regenerate the dashboard after adding the Wave 3 QA run
362bb52 feat(acquisition): typed lead intake with attribution and consent
```

## Conflicts

`main` advanced by six commits of knowledge-documentation work while this branch
was open, producing four conflicts — all in `docs/`.

| File | Type | Resolution |
|---|---|---|
| `docs/backlog/index.md` | Generated | Regenerated |
| `docs/backlog/open.md` | Generated | Regenerated |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | Generated | Regenerated |
| `docs/bugs/BUG-0021-*.md` frontmatter | Content | Kept this branch's `ResolvedAt` |

## Conflict Resolutions

**Generated files were regenerated, not hand-merged.** A hand-merged generated
file is wrong the moment the generator next runs, and hides that behind a
plausible diff. Choosing either side would have been equally wrong.

**BUG-0021 frontmatter** — `main` had `ResolvedAt:` empty; this branch sets
`2026-08-16`. Kept this branch's value: this is the branch that fixes the bug, so
an empty `ResolvedAt` would have reported a fixed defect as still open. Taking
`main`'s side would have lost nothing textually and misreported the record.

**A genuine id collision surfaced after the merge**, which the conflict markers
never showed: `main` had added
`ITEM-0026-desktop-agent-windows-installer-is-unsigned` while this branch created
`ITEM-0026` for the partner form. `rebuild-backlog` caught it as a structural
error. This branch's record was renumbered to `ITEM-0030` and its six references
updated; `main`'s keeps `0026` because it merged first.

Worth recording that the collision was **invisible to Git** — two different
filenames, no textual conflict — and only the backlog validator knew. That is the
argument for running `backlog:check` after every merge, not only after editing
records.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-lead-partner-acquisition-wave3-1695167.md`](../../qa/runs/2026-08-16-lead-partner-acquisition-wave3-1695167.md) — **PASS** |
| **Bug IDs** | `BUG-0021` closed `FIXED` |
| **Backlog Items** | `ITEM-0030` created (`FIX_NOW`) |

**BUG-0021 was worse than its record.** It named three fabricated values; two
more were found:

- `industry: form.interestArea || 'General HR operations'` — the form wrote the
  visitor's *interest area* into the industry column, so a contact who cared
  about payroll was recorded as being in the payroll industry and the real
  interest was lost. The service then wrote the same value into `interestedPlan`.
- `subStatus: 'Demo requested'` hardcoded on every lead, so the column said the
  same thing for everyone.

The cause was schema-driven: three columns were `NOT NULL` that the form never
asked about, so it invented values to satisfy them. Fixed by making the columns
nullable rather than by inventing better defaults.

## CI

| | |
|---|---|
| **CI Run ID** | `31961131997` (task branch, on `cc8cc1c`) · post-merge run on `ca18353` |
| **CI Result** | **PASS** — `CI required gate` on `cc8cc1c`, the exact SHA merged, including the `Database migration gate`, which applied the additive migration to an empty PostgreSQL 16. |

Two CI failures were diagnosed and fixed rather than retried:

1. **Framework validation failed on `362bb52`** — the QA run file was written
   *after* `generate-dashboards` ran, so the dashboard did not index it.
   Reproduced locally before fixing. The ordering that avoids it is
   `rebuild-backlog` → write records → `generate-dashboards` → `validate`, with
   regeneration last. This is the second time in this parent task that a document
   written after the regeneration step has failed the gate, which is why it is
   recorded here rather than rediscovered a third time.
2. **11 prettier errors** in files this wave touched, reported by the non-gating
   `Lint services/api` job. Fixed rather than left to grow that baseline under
   cover of a check that does not block — the same call as Wave 1.

## Post-Merge Validation

Against the merged SHA `ca18353`:

| Command | Result |
|---|---|
| Post-merge CI on `main` | **PASS** |
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks |
| `npm run backlog:check` | **PASS** — 67 records, 0 structural errors |
| Lead + Wave 1/2 + BUG-0030 specs | **PASS** — 64 tests |
| `npm --workspace landing run test` | **PASS** — 49 tests |

## Release / Deployment Impact

**Not deployed.** `ROLLBACK_CLASS = DATABASE_ADDITIVE`.

The migration adds columns, two enums and three indexes, and drops `NOT NULL`
from `Lead.industry` and `Lead.companySize`. It reads and writes no rows. A code
rollback is safe: older code sees a superset of the schema it expects, and the
relaxed columns still accept every value it would write.

**`BUG_0030_DEPLOYMENT = DEPLOY_REQUIRED`** — that P0 fix is merged but has not
been observed in production. Wave 3 does not depend on it and was developed on a
separate branch, but the Admin Plans screen stays broken in production until an
API release ships.

## Knowledge Capture

- `docs/qa/regressions/index.md` — `REG-021`, bug class
  `fabricated-required-field`.
- Durable rules, verified here rather than assumed:
  - **A required column the form does not collect will be fabricated.** The fix
    for invented data is usually to relax the schema, not to invent a better
    default.
  - **Inquiry intent and feature interest are different questions.** Storing one
    in the other's column loses both.
  - **Marketing consent is optional and separate from notice acknowledgement.**
    One boolean for both makes the distinction unrecoverable and the consent
    unusable as evidence.
  - **The server records which notice version was in force.** A client-supplied
    version could claim any notice at all.
  - **Absent attribution stays absent.** Defaulting a UTM parameter attributes
    organic traffic to a campaign nobody ran.

## Obsidian Sync

Run against the merged state — see the final report.

## Cleanup

Worktree and local branches removed after the merge — see the final report.
