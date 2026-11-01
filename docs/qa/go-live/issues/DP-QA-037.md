# DP-QA-037 — The employee export includes soft-deleted employees, with plaintext national ID and tax ID

| Field | Value |
|---|---|
| Category | Data protection / functional — "deleted employee exclusion" |
| Severity / Priority | **High / P1** (deleted people's personal data is exported; the live list correctly hides them) |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), test DPQA-IMX-030; manual reproduction with a disposable employee |
| Evidence | export CSV (kept local, not attached: it contains the probe's dummy identity values); DB row `isDeleted = true` for every listed name |

**Reproduction.** Tenant A (Starter), owner token. (1) Create an employee with `cnic` and `taxIdentifier`. (2) Export employees (`POST /data-management/exports`, `{moduleKey:'employees', format:'csv'}`), download: the row is present (precondition). (3) `DELETE /employees/:id` → 200; the employee is `isDeleted = true` and absent from `GET /employees`. (4) Export again: **the deleted employee is still in the file**, with the `cnic` and `taxIdentifier` values in plain text. Reproduced with four different deleted employees; they remain in every later export.

**Expected.** A deleted employee is excluded from the export exactly as from the list (DPQA-SEC-006, DPQA-SEC-007 already assert this for the API and pickers).

**Impact.** An HR/admin who exports re-publishes personal data of people the tenant deleted. Whether HR/admin should receive plaintext national/tax identifiers in bulk files at all is a separate owner decision, see [[DP-QA-038]].

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — IMX-030 fails (after a deterministic correction that first proves the export sees the live employee) |
