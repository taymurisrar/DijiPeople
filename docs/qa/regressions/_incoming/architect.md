# Regression entries — Architect integration fixes (TASK-0032)

To be merged into `docs/qa/regressions/index.md` at integration. Reserved range:
REG-600..REG-609.

---

### REG-600 — A record the runtime can list 404s when opened

| | |
|---|---|
| **Bug class** | Two dispatchers for one module list that drift apart — the shape `generic-delete.spec.ts` already guards for remove vs bulk-delete. |
| **Module** | `services/api/src/modules/platform-runtime` — `platform-runtime.service.ts` `get()` |
| **Bug record** | BUG-3565 |
| **Root cause** | `list()` had cases for `contract-templates` and `signature-requests`; `get()` did not, so both fell to `findGeneric`, whose fallback only knows plans, subscriptions and payments. |
| **Regression test** | `services/api/src/modules/platform-runtime/runtime-get-coverage.spec.ts` |
| **Scenario** | `get(superAdmin, 'contract-templates' \| 'signature-requests', id)` reaches `ContractsService.getTemplate` / `getSignatureRequest` and returns the record in the runtime envelope. |
| **Fails without the fix** | Yes — with the service change stashed, both cases fail (`findGeneric` is reached instead). |
| **Active** | yes |
