# DP-QA-036 — `seed:config` gives onboarded tenants an unroutable default approval route (leave and timesheets refused)

| Field | Value |
|---|---|
| Category | Functional / deployment — core workflow blocked after a deploy |
| Severity / Priority | **High / P1** (blocks leave and timesheet submission for every onboarded tenant that has not configured its own approval matrix; recoverable by an administrator) |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), tests DPQA-APR-001, DPQA-APR-002; 11 leave tests failed in the first full run |
| Evidence | fresh tenant `qa-probe`, created through the real onboarding workflow and left untouched; API error text below; DB state |

**What happens.** A tenant created through the real workflow (customer → onboarding → create-tenant → owner activation) ends with an owner that holds **only `global-admin`** and **no approval matrices at all**. Leave and timesheet requests then use the fallback route and succeed. `npm run seed:config` (which `release:api` runs on every deploy) then runs `seedTenantDefaultApprovalMatrices`, which installs default matrices on every tenant that has none: five rows, of which the two *active* ones are `LEAVE_REQUEST` and `TIMESHEET` "…to tenant administrator", approver role `system-admin`. **Nobody in that tenant holds `system-admin`** (owner: `global-admin`; other roles: employee/manager/hr/payroll-manager). From then on every submission is refused:

```
400 VALIDATION_FAILED  APPROVAL_ROUTE_UNRESOLVED
This request cannot be submitted because its approval route has a step nobody can approve.
Step 1 (role): the named role has no active users. Assign somebody to it, or point the step at a different approver.
```

**Verified state change.** Before the seed: 0 matrices, leave submit 201 (RUN-006 first pass, 318 tests passed). After five seed runs: 5 matrices, active step → `system-admin`, 0 holders, 11 leave tests fail with the error above. The RUN-005 database (same workflow, earlier candidate) had no matrices and leave worked.

**Why it is not a test artefact.** `qa-probe` was provisioned by the product workflow only; the only operation applied afterwards was `seed:config`. The comment in `seed-config.ts` ("provisioning guarantees a member for it") does not hold for the onboarding path: `platform-onboarding.service.ts` assigns `system-admin` to the onboarding owner record, but `tenant-identities-provisioning.service.ts` assigns `global-admin` only, and the end state is `global-admin` only.

**Impact on production.** Tenants onboarded this way that are not yet configured (typically new tenants) lose leave and timesheet submission at the next deploy. Existing tenants that configured their own matrices are not touched (`existing > 0` ⇒ skip).

**Workaround / remediation used by QA.** The error's own advice: assign the approver role. QA assigned `system-admin` to the owners of the long-lived QA tenants (A, B, Growth, Enterprise, Custom) so the rest of the regression could run; `qa-probe` stays untouched as evidence.

**Fix options (owner/development).** (a) the default active step targets a role the onboarding owner really holds (`global-admin`); (b) provisioning gives the owner `system-admin` as the code comment claims; (c) the seed only activates a role step whose role has an active holder. Add a test that provisions through the real path, runs the seed, and submits leave.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — APR-001/002 fail on `qa-probe` |
