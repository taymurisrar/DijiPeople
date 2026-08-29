---
ID: BUG-2043
aliases: [BUG-2043]
Title: The Audit Events screen reports the number of rows it loaded as the tenant's total audit count
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/audit]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2043 — The Audit Events screen reports the number of rows it loaded as the tenant's total audit count

## Summary

The tenant Audit Events screen shows 20 rows and its footer reads **"Showing 1 to
20 of 20 records"**. The tenant's audit log held **305** rows at the time. The
screen is not truncating a longer list with a "load more" affordance missing — it
states a total, and the total it states is the size of the single API page it
happened to fetch. There is no way from the screen to reach the other 285 rows.

For a product whose Audit & Compliance section is a selling point, this is the
worst-shaped failure available: not an error, a confident wrong answer.

## Expected Behavior

The footer states the tenant's real audit total, and the pager walks the whole
log. `GET /api/audit-logs` already returns exactly the number needed —
`meta.total` — alongside `page`, `pageSize` and `totalPages`.

If the screen is instead showing a filtered view, it says so, and reports the
filtered count as a filter rather than as the total.

## Actual Behavior

```
UI   /settings/audit-compliance/history/audit-events
     20 rows rendered; footer "Showing 1 to 20 of 20 records"

API  GET /api/audit-logs?page=1&pageSize=100
     meta { page: 1, pageSize: 100, total: 305, totalPages: 4 }
```

Two follow-ups establish that the 20 is a hard bound and not a rendering
truncation:

- Setting the table's **Rows per page** control to 100 changed the URL to
  `&pageSize=100`. The table still rendered 20 rows and still said "of 20".
- `?page=2` gives **"Showing 11 to 20 of 20 records"** with 10 rows and no
  further pages.

The second line is the tell: it is a *client-side* pager running over 20 loaded
rows at a page size of 10.

## Reproduction

1. Sign in to a tenant workspace with `audit.read`, on a tenant whose audit log
   holds more than 20 rows.
2. Open `/settings/audit-compliance/history/audit-events`. Read the footer.
3. Call `GET /api/audit-logs?page=1&pageSize=100` with the same session and read
   `meta.total`.
4. Append `?page=2` to the screen's URL: the footer reads "Showing 11 to 20 of
   20 records" and the pager offers nothing beyond it.
5. Change **Rows per page** to 100: the URL gains `&pageSize=100`, the row count
   does not change.

## Evidence

Observed live on 2026-08-29 against the production API at `949f461c`, on the
DijiPeople Demo tenant, after roughly 100 state-changing operations. UI footer
and `meta.total` as quoted under Actual Behavior.

**The caveat this record was filed with has since been settled in code, and the
answer matters to whoever picks it up.** The QA log recorded that the route
always carries `viewId=d93832a2-5fb8-5f63-8d87-4baccc78332d` — re-appended even
when the page is requested without it — so from the outside the 20 could have
been a saved-view filter rather than a fetch bound. It is not. The `viewId` is
re-appended by the pager's own link builder, and the 20 comes from an unpaginated
fetch:

- `apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx:116`
  fetches `settingsListApiPath(adapter)` — for this adapter, the bare
  `/audit-logs`, **with no `page` or `pageSize`**.
- `services/api/src/modules/audit/dto/audit-log-query.dto.ts` defaults
  `pageSize = 20` and caps it at 100. So the server returns 20 rows and a
  `meta.total` of 305.
- `settings-runtime-pages.tsx:134-152` then hands the table
  `totalItems: records.length` — the 20 — with `paginationMode="client"` and a
  client `pageSize` defaulted to 10 from the URL. The response `meta` is never
  read.
- `apps/web/app/components/data-table/data-table.tsx:209-212` — in client mode
  `totalProcessedRows` is `processedRows.length`; `:249` assigns that to
  `totalRecords`, and `:703` prints it. The footer is structurally incapable of
  exceeding the number of rows fetched.
- `settings-runtime-pages.tsx:357-365` shows the shape of the fix already exists
  in the file: `settingsListFallbackApiPath()` forces `page=1&pageSize=100` — but
  it is used only by the single-record lookup fallback, never by the list.
- The **Rows per page** control feeds the client page size only; nothing carries
  it back to the server fetch.

Ordering is `createdAt desc`
(`services/api/src/modules/audit/audit.repository.ts:76`), so the visible 20 are
the 20 most recent — which is why the visible set held one
`TIMESHEET_BACKGROUND_JOB_COMPLETED` of 216 and one `auth.login.succeeded` of 6.
That skew is a consequence of recency, not of a filter.

## Root Cause

Established. The settings runtime list fetches one unpaginated API page — taking
the server's default `pageSize` of 20 — then reports the length of that page as
the total, because it passes `totalItems: records.length` and runs the table in
client pagination mode instead of reading `meta.total` and paginating on the
server.

This is a property of the **settings runtime list**, not of the audit module.
Every read-only settings adapter whose API returns a paginated envelope has the
same defect; audit is where it is most damaging, because the collection is large
and the screen's whole purpose is completeness.

## Impact

An auditor or tenant admin investigating an incident is shown 20 events and told
that is everything the tenant has. 93% of the log is unreachable and its absence
is not signalled. Any conclusion drawn from this screen — "there is no record of
that change" — is unsound, and the screen gives no reason to doubt it.

Reachable in production today, on the default screen, for every tenant with more
than 20 audit rows.

## Affected Areas

`apps/web` settings runtime list (`settings-runtime-pages.tsx`, the shared
`data-table` footer), the `audit-logs` settings adapter
(`settings-adapter-registry.ts:6584-6642`), and every other read-only settings
adapter backed by a paginated API. `services/api/src/modules/audit` is the data
source and is behaving correctly.

## Proposed Resolution

Make the settings runtime list honour the server's pagination envelope: pass the
requested `page`/`pageSize` into the fetch, read `meta.total` and
`meta.totalPages` into the table's pagination props, and switch this list to
`paginationMode="server"`. Where an adapter's API genuinely returns a bare array
with no envelope, keep client mode — the count is then honest, because the whole
collection really was loaded.

Sweep the other read-only settings adapters for the same shape rather than fixing
only audit; the defect lives in the shared page, so a spot fix leaves siblings
lying.

## Acceptance Criteria

- With 305 audit rows on a tenant, the Audit Events footer states 305.
- The pager reaches the last row of the log.
- Changing **Rows per page** changes the number of rows fetched from the API, not
  only the client slice.
- A settings list whose API returns an envelope reports `meta.total`, never
  `records.length`.

## Regression Coverage

None yet. A test rendering the settings runtime list against a stubbed API that
returns `{ items: 20 rows, meta: { total: 305 } }` and asserting the footer says
305 would fail today, and would cover every adapter through the shared page.

## Dependencies

None identified.

## Related Items

BUG-1959 (the departments list returns a bare array and rejects the `pageSize`
parameter) is the same contract seam seen from the API side: there the envelope
is missing, here the envelope exists and the client discards it. Read both before
deciding where pagination is owned.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — the `viewId` caveat the QA log flagged was settled in code before filing: the parameter is re-appended by the pager's own link builder and is not a saved-view filter. Root cause established as the unpaginated settings-runtime fetch.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — a compliance-grade wrong answer on a screen sold as an audit trail.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[audit-and-events]]

<!-- GRAPH:END -->
