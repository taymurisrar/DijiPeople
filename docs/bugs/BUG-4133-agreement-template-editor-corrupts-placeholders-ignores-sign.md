---
ID: BUG-4133
aliases: [BUG-4133]
Title: Agreement template editor corrupts placeholders, ignores signer roles and cannot edit drafts or print
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-10-12
DetectedInSha: eacb525e
AffectedModules: [contracts]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-681
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/agreement-templates-hotfix
CreatedAt: 2026-10-12
UpdatedAt: 2026-10-12
ResolvedAt: 2026-10-12
---

# BUG-4133 — Agreement template editor corrupts placeholders, ignores signer roles and cannot edit drafts or print

## Summary

The platform admin's contract template editor stored placeholders in a form no
renderer recognises, offered free-text fields for the lifecycle gate and the
required signer roles that nothing validated or read, created a new version on
every save, and its Print button could do nothing at all. Production template
55b74891 ("DijiPeople SaaS Subscription & Pilot Agreement") carries all of it.

## Expected Behavior

Placeholders typed into a template resolve in every preview, PDF and signed
copy. The lifecycle gate and signer roles are chosen from what the platform
supports, and the signer roles decide who signs agreements drafted from the
template. The current draft is edited in place; published versions are never
altered. Print prints the document.

## Actual Behavior

- TipTap's Link extension ran with `autolink`, so `{{customer.contact.email}}`
  was stored as `{{<a href="http://customer.contact.email">…</a>}}` — 18 tokens
  in template 55b74891, including both signature lines.
- `lifecycleGatePurpose` holds `customer_onboarding` (and `CUSTOMER_CONVERSION`
  on another template); only `TENANT_PROVISIONING` is read by any rule.
- `partyDefinitions` / `signingConfig` stored "Authorized signatory" and were
  never read; every agreement got the default parties.
- Every save created a version; there was no publish or unpublish action.
- Print opened a popup with window features and returned silently when the
  browser blocked it.
- The admin proxy for `/contract-templates` exported only GET and POST, so the
  PATCH behind Activate / Deactivate / Archive never reached the API.
- Four keys used by template 55b74891 (`commercial.pilot*`) were unregistered,
  synthesised as required, and made the template ineligible for every source in
  Create Agreement.

## Reproduction

1. Open `/templates/55b74891-0464-45ff-8a39-2d5267b10d6a`, type `{{customer.contact.email}}`, save, read `ContractTemplateVersion.contentHtml`.
2. Type any text into Lifecycle gate purpose / Required signer roles and save; create an agreement from the template; read its `ContractParty` rows.
3. Save twice; two new versions appear.
4. Press Print with pop-ups blocked.

## Evidence

- Production, read-only, 2026-10-12: template 55b74891 v2 (published) holds 18 anchor-wrapped tokens; v1 is an unpublished draft; no agreement references either version; gate `customer_onboarding`.
- `apps/admin/app/_components/documents/contract-document-editor.tsx` — `Link.configure({ autolink: true })`; `printContractDocument` used `window.open(..., "width=1000,height=800")` and `if (!printWindow) return`.
- `services/api/src/modules/contracts/contracts.service.ts` — `create()` built default parties without reading the template version's signing config; `createTemplateVersion` was the only write path.
- `apps/admin/app/api/contract-templates/[[...path]]/route.ts` — no PATCH export.

## Root Cause

Editor auto-linking plus renderers that only matched bare `{{key}}`; template
lifecycle fields modelled as free text with no catalog; no draft-edit,
publish or unpublish path; a popup-based print; an incomplete proxy.

## Impact

Platform operators issuing customer agreements. Any agreement from template
55b74891 would have printed raw tokens in place of the customer's contact
details and both signature lines. Reachable in production; no agreement had
been issued from it yet.

## Affected Areas

`services/api` contracts module (template endpoints, agreement creation, send,
preview/PDF), `apps/admin` template editor, document editor and template proxy.

## Proposed Resolution

Unwrap markup inside placeholder braces on write and on read; catalog gates and
signer roles and apply the signer plan at agreement creation; edit-in-place for
the latest unreferenced draft with explicit publish/unpublish; print from a
same-origin frame; content checks before publish and before send.

## Acceptance Criteria

See QA-CONTRACTS-001.

## Regression Coverage

REG-681 — `services/api/src/modules/contracts/agreement-template-lifecycle.spec.ts`
and `services/api/src/modules/contracts/contracts.workflow.spec.ts`; five
lifecycle specs fail with the unwrapper or the signer plan disabled.

## Dependencies

None.

## Related Items

- [[QA-CONTRACTS-001-a-template-draft-is-edited-in-place-published-and-its-agreem]]

## Resolution

Branch `agent/agreement-templates-hotfix`. Production data was not changed:
template 55b74891 keeps its stored bytes and renders correctly; its gate and
its fill-in notes are for the owner to resolve in a new draft.

## QA Retest

QA-CONTRACTS-001 (automated), plus a read-only render of the production HTML of
template 55b74891 v1 and v2 against the fixed code: no token left unresolved.

## History

- 2026-10-12 — created from qa run at `eacb525e`.
- 2026-10-12 — fixed on `agent/agreement-templates-hotfix`; disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-681 (see the regression register)

<!-- GRAPH:END -->
