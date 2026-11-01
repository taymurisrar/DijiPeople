# DP-QA-038 — Encrypted/hashed storage columns are offered for import and written to the export; plaintext national/tax ids are exported

| Field | Value |
|---|---|
| Category | Data protection / data integrity |
| Severity / Priority | Medium / **P2** — owner decision needed for the plaintext identifiers |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), test DPQA-IMX-031; `GET /data-management/modules/employees/fields` and an exported CSV |

**Observed.** The employee module offers 57 import fields. Three are storage internals: `cnicEnc`, `cnicHmac`, `taxIdentifierEnc` (encrypted value, lookup hash, encrypted value). The export header contains the same three, next to the plaintext `cnic` and `taxIdentifier` columns. The registry marks a field "sensitive, excluded from import" by name pattern (`module-registry.service.ts`), and only `agentRefreshTokens` matches in this module.

**Risks.** (1) Importing a value into `*Enc`/`*Hmac` writes arbitrary text into a column the application expects to be ciphertext or a keyed hash, so the record can no longer be decrypted or looked up. (2) The export publishes ciphertext and lookup hashes. (3) `cnic` and `taxIdentifier` leave the system in plaintext; the repository rule is "no full national ids … in responses" (AGENTS.md Security). Access is limited to roles holding `data-management.*` (global/system admin and HR).

**Expected.** `*Enc` and `*Hmac` columns are never offered or exported. The owner decides whether plaintext identifiers may appear in bulk files and, if so, for whom.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — IMX-031 fails on the storage columns; plaintext identifiers recorded as an owner decision (annotation `owner-decision`) |
