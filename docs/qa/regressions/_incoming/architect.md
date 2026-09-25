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

> Note: REG-602..REG-609 were handed to WP-10, which overlapped this file's
> original reservation; the Architect's later entries continue from REG-620.

### REG-620 — Deleting a partner with restricted history crashes with a 500

| | |
|---|---|
| **Bug class** | A delete guard that checks some `onDelete: Restrict` relations and not others, so the database refuses what the service allowed. |
| **Module** | `services/api/src/modules/partners` — `partner-deletion.service.ts` |
| **Bug record** | Found by TASK-0032 WP-09 QA (partners, Defect 1). |
| **Root cause** | `deletePartners` checked leads, commissions, agreements, referral links and portal users, but not the origin inquiry, onboarding applications, lead attribution history, lead reviews or support cases — all Restrict — nor the partner's own Restrict timeline. |
| **Regression test** | `services/api/src/modules/partners/partner-deletion.service.spec.ts` ("restricted relations refuse by name") |
| **Scenario** | A partner with any of those relations is refused with the relation named; a partner with none is deleted together with its timeline in one transaction. |
| **Fails without the fix** | Yes — with the service change stashed, the refusal and timeline cases fail. |
| **Active** | yes |

### REG-621 — Bulk-deleting a lead with restricted history crashes with a 500

| | |
|---|---|
| **Bug class** | Same as REG-620, for leads. |
| **Module** | `services/api/src/modules/leads` — `leads.service.ts` `bulkDeleteLeads` |
| **Bug record** | Found by TASK-0032 WP-09 QA (partners Defect 1, agreements Defect 5). |
| **Root cause** | Only a converted customer blocked the delete; `LeadAttributionCorrection`, `Contract.relatedLeadId` and `PartnerLeadReview` are Restrict and were not checked. |
| **Regression test** | `services/api/src/modules/leads/lead-delete-and-partner.spec.ts` |
| **Scenario** | A lead with attribution changes, agreements or partner reviews is refused with a 400 naming them; a lead with none is deleted. |
| **Fails without the fix** | Yes. |
| **Active** | yes |

### REG-622 — An attributed lead shows no referral partner

| | |
|---|---|
| **Bug class** | A lookup field whose label depends on an embedded relation the API never embeds. |
| **Module** | `services/api/src/modules/leads` `getLead`; `apps/admin` lead attribution panel |
| **Bug record** | Found by TASK-0032 WP-09 QA (partners Defects 2 and 3). |
| **Root cause** | `getLead` returned only the scalar `partnerId`; the runtime form labels a lookup from `values.partner`, and the attribution panel had no current-partner value. |
| **Regression test** | `services/api/src/modules/leads/lead-delete-and-partner.spec.ts` ("the attributed partner is embedded") |
| **Scenario** | `getLead` returns `partner { id, displayName, type, status }` and nothing more about the partner; the panel shows "Current partner". |
| **Fails without the fix** | Yes. |
| **Active** | yes |
