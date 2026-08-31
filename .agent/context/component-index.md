# Component Index

> **Last verified:** 2026-08-31
> **Verified against commit:** 69496436
>
> **This file is generated. Do not hand-edit it.**
> `node scripts/generate-component-index.mjs` rebuilds it;
> `--check` fails when the committed copy has drifted from the source.
> To change an entry, change the doc-comment above the export it describes.

The shared frontend kits, harvested from the doc-comments that sit above their
exports. This exists so that "what does this component already do" is a
question an agent can answer by retrieval rather than by reading a directory.

**It is an index, not the truth.** The code is implementation truth and the
comment beside it is the reasoning; this document is a route to both. Every row
carries `file`:`line` for that reason — read the source before changing it.

**An export missing from here is undocumented, not absent.** 813 of
1027 exports across these kits carry no
doc-comment and are omitted rather than listed as bare names. That ratio is
itself worth knowing: it is where a UI/UX or Frontend agent is working without
stated rationale, and where adding one is worth more than a new abstraction.

**Used by** counts tracked files importing the name, excluding the file that
declares it. A high count means a change is repository-wide, not local.

## CURRENT

What follows is measured from the tree at the commit stamped above, not
described from memory. Every count, every path and every line number is
re-derived on each run.

## What to search here

- A component name in any spelling — `ModuleActionBar`, `module-action-bar`,
  `command bar`. Retrieval normalises between them; this document does not
  have to repeat itself.
- A behaviour — "empty state", "confirm", "overflow", "responsive".
- A kit, when the question is which component to reuse rather than which to read.

## The kits

### Platform admin kit — `apps/admin`

`ProDataTable` (`crm/data-table.tsx`) is the required table for every production admin screen. A hand-rolled table here is a review failure.

71 documented export(s); 246 undocumented export(s) omitted.

| Export | Kind | Used by | Where | What it is |
|---|---|---|---|---|
| `PanelCard` | component | 9 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:16 | The pieces every tenant panel is built from. |
| `ModuleActionBar` | component | 8 | `apps/admin/app/_components/runtime/module-action-bar.tsx`:85 | The command bar every admin list and record screen draws its buttons in. |
| `PanelDialog` | component | 8 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:270 | A modal that traps focus, restores it on close and can always be dismissed with Escape. |
| `StatePill` | component | 8 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:147 | A status word carrying its own icon and text, never colour alone — the same pill has to be readable to someone who cannot distinguish red from green. |
| `RecordStatusGroup` | component | 5 | `apps/admin/app/_components/runtime/record-status-group.tsx`:42 | The record header status group. |
| `NotificationBell` | component | 2 | `apps/admin/app/_components/notifications/notification-bell.tsx`:34 | The bell: a count, and the last few things worth knowing. |
| `PlanPriceManager` | component | 2 | `apps/admin/app/_components/plan-price-manager.tsx`:94 | Plan prices. This screen was a stack of cards, one per price, each repeating "Cycle", "Amount", "Stripe Price ID" and "Subscriptions" as its own labelled block — so a plan priced in six currencies across two periods, with a few superseded versions behind it, rendered several hundred vertical pixels of column headings. |
| `AccountPreferencesClient` | component | 1 | `apps/admin/app/_components/account-preferences-client.tsx`:26 | Personal console preferences, stored against the operator. |
| `NotificationsFeed` | component | 1 | `apps/admin/app/_components/notifications/notifications-feed.tsx`:30 | What has happened on this platform that somebody should look at. |
| `PaymentRecheckPanel` | component | 1 | `apps/admin/app/_components/customers/payment-recheck-panel.tsx`:63 | What Stripe says about this customer's payment, and what to tell them. |
| `PlanCommercialSummary` | component | 1 | `apps/admin/app/_components/plans/plan-commercial-summary.tsx`:33 | What this plan currently costs and who is on it. |
| `PlanEntitlementsPanel` | component | 1 | `apps/admin/app/_components/plans/plan-entitlements-panel.tsx`:22 | Plan entitlements. The entitlement set is what a plan actually sells, and until now it could only be changed on the legacy `?workspace=legacy-commerce` page — the runtime record page showed an "Entitlements" tab with nothing on it. |
| `ReadinessCard` | component | 1 | `apps/admin/app/_components/tenants/tenant-overview-panel.tsx`:446 | Deterministic readiness, shown as the list of rules it checked. |
| `RecordCommandBar` | component | 1 | `apps/admin/app/_components/runtime/record-command-bar.tsx`:22 | The default record command bar for a **server-rendered** detail page. |
| `RowActions` | component | 1 | `apps/admin/app/_components/crm/row-actions.tsx`:38 | The actions available on one row of a table. |
| `StatTile` | component | 1 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:65 | One number with the thing it counts. |
| `TenantAccessPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-access-panel.tsx`:98 | Access & Security. This is not a tenant user console. |
| `TenantAppsModulesPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-apps-modules-panel.tsx`:87 | Apps & Modules — the tenant-level control centre for DijiPeople capability. |
| `TenantCommercialPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-commercial-panel.tsx`:51 | Commercial. Everything here is a record this platform holds: a Subscription, Contracts and Invoices. |
| `TenantConfigurationPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-configuration-panel.tsx`:27 | Configuration — the workspace itself, not the HRM inside it. |
| `TenantDomainsPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-domains-panel.tsx`:74 | The hostnames a workspace answers on. |
| `TenantEraseDialog` | component | 1 | `apps/admin/app/_components/tenants/tenant-erase-dialog.tsx`:33 | Erase Tenant. Intentionally difficult. |
| `TenantOperationsPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-operations-panel.tsx`:51 | Operations. Provisioning history, support load and background job outcomes — all read from records the platform writes. |
| `TenantOverviewPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-overview-panel.tsx`:30 | The Overview tab. It answers the questions a Platform Admin actually opens a tenant to answer — is it working, who owns it, what is it paying for, is anything broken — rather than listing the tenant table's columns. |
| `TenantRecordHeader` | component | 1 | `apps/admin/app/_components/tenants/tenant-record-header.tsx`:21 | The tenant record header. |
| `TenantSystemPanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-system-panel.tsx`:28 | System — internal platform metadata, and the one place tenant erasure lives. |
| `TenantTimelinePanel` | component | 1 | `apps/admin/app/_components/tenants/tenant-timeline-panel.tsx`:54 | Timeline — readable operational history, not the compliance audit log. |
| `TenantControlPlaneError` | component | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:512 | An API failure with the context needed to chase it. |
| `useTenantResource` | function | 10 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:606 | Load one tab's data. Every tab owns its own request and is only fired when that tab is opened, so arriving on Overview does not pull Commercial, Apps and Operations with it. |
| `relativeTime` | function | 5 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:405 | Relative time for heartbeat and last-seen columns. |
| `runStandardRecordCommand` | function | 4 | `apps/admin/lib/runtime/standard-record-commands.ts`:23 | Back, New and Refresh for the record pages that are **not** the runtime. |
| `useReasonPrompt` | function | 3 | `apps/admin/app/_components/runtime/use-reason-prompt.tsx`:62 | Collects a governed reason through the design system instead of `window.prompt` (BUG-0020). |
| `describePlanSchedule` | function | 2 | `apps/admin/lib/runtime/plan-headline-prices.ts`:180 | "Per seat, PKR" — how the tiles name the schedule they are showing. |
| `formatWhen` | function | 2 | `apps/admin/app/_components/notifications/notification-model.ts`:86 | "4 minutes ago", falling back to an absolute time once relative stops being the more useful phrasing. |
| `humanizeLabel` | function | 2 | `apps/admin/lib/runtime/humanize-label.ts`:89 | Display text for a stored enum value, lookup key or similar. |
| `recordDisplayName` | function | 2 | `apps/admin/lib/runtime/destructive-confirm.ts`:95 | The best display name for a record, from whatever the row happens to carry. |
| `useConfirmAction` | function | 2 | `apps/admin/app/_components/runtime/use-confirm-action.tsx`:50 | Confirmation for an irreversible, billable create (BUG-0022). |
| `useRuntimeLookupOptions` | function | 2 | `apps/admin/lib/runtime/use-runtime-lookup-options.ts`:20 | Read an allowlisted runtime lookup. |
| `buildLookupRecordHref` | function | 1 | `apps/admin/lib/runtime/lookup-record-href.ts`:64 | The link for a resolved lookup value. |
| `buildWritePayload` | function | 1 | `apps/admin/lib/runtime/runtime-write-payload.ts`:73 | The values a create or update request should actually carry. |
| `describeBlockedSave` | function | 1 | `apps/admin/lib/runtime/blocked-save-feedback.ts`:52 | The summary message. Names the fields so it stands on its own even when the tab strip has scrolled out of view — the message was previously the only feedback available and said nothing. |
| `describeDestructiveConfirm` | function | 1 | `apps/admin/lib/runtime/destructive-confirm.ts`:47 | Title, description and names for a destructive confirmation. |
| `errorCountByTab` | function | 1 | `apps/admin/lib/runtime/blocked-save-feedback.ts`:33 | How many failures sit on each tab, for the tab strip's badges. |
| `firstFailingTab` | function | 1 | `apps/admin/lib/runtime/blocked-save-feedback.ts`:22 | The tab holding the first failure, or null when none of them declare one. |
| `humanizeErrorMessage` | function | 1 | `apps/admin/lib/runtime/humanize-field-error.ts`:62 | Whether this message is implementation detail rather than user-facing text. |
| `humanizeFieldError` | function | 1 | `apps/admin/lib/runtime/humanize-field-error.ts`:24 | Replace a leading DTO property name with the label the operator sees. |
| `isTransportFailure` | function | 1 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:683 | Whether a failure means "the request never got an answer" rather than "the server said no". |
| `planEntitlementKeys` | function | 1 | `apps/admin/lib/runtime/plan-entitlement-keys.ts`:29 | The entitlement keys a plan record grants, whatever shape the record is in. |
| `planSubscriptionCount` | function | 1 | `apps/admin/lib/runtime/plan-subscription-count.ts`:22 | How many tenants are billed on a plan, whatever shape the record is in. |
| `readRuntimeLookupLabel` | function | 1 | `apps/admin/lib/runtime/runtime-lookups.ts`:138 | The display name of a related record, wherever this schema happens to keep it. |
| `reconcileWithErasureReceipt` | function | 1 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:708 | Ask the receipt what happened when the response did not arrive. |
| `recordHeaderWritePermission` | function | 1 | `apps/admin/lib/runtime/runtime-permissions.ts`:54 | The permission a header slot's write route is governed by. |
| `useTenantRecordActions` | function | 1 | `apps/admin/app/_components/tenants/use-tenant-record-actions.tsx`:99 | Routes tenant action-bar requests to whichever surface owns the change. |
| `acceptsField` | function | 0 | `apps/admin/lib/runtime/runtime-write-payload.ts`:20 | Whether the runtime will accept this field on this kind of write. |
| `fetchErasureReceipts` | function | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:663 | Erasure receipts for one tenant, read without addressing the tenant itself. |
| `mergeVisibleColumns` | function | 0 | `apps/admin/app/_components/runtime/runtime-module-list.tsx`:1385 | Which columns are visible, given a saved preference written against an older version of the module. |
| `normalizeColumnOrder` | function | 0 | `apps/admin/app/_components/runtime/runtime-module-list.tsx`:1336 | Merge a saved column order with the module's current one. |
| `normalizeWriteValue` | function | 0 | `apps/admin/lib/runtime/runtime-write-payload.ts`:49 | What an empty optional field should be sent as — or whether to send it. |
| `resolveLookupRecordRoute` | function | 0 | `apps/admin/lib/runtime/lookup-record-href.ts`:44 | The module a lookup reads from, if Platform Admin can show that record. |
| `standardRecordActions` | function | 0 | `apps/admin/lib/runtime/standard-record-commands.ts`:56 | The registry's command bar for a module, with the page's own commands merged in on top — same rule the registry itself uses, so a bespoke page can override a default's label or states without losing the rest. |
| `ConsolePreferencesApplier` | value | 1 | `apps/admin/app/_components/console-preferences-applier.tsx`:23 | Apply the operator's preferences to every page, not just the one that sets them. |
| `NOTIFICATIONS_ENDPOINT` | constant | 2 | `apps/admin/app/_components/notifications/notification-model.ts`:37 | The read endpoint, and the one that clears the unread mark. |
| `NOTIFICATIONS_READ_EVENT` | constant | 2 | `apps/admin/app/_components/notifications/notification-model.ts`:47 | The badge and the page read the same count from the same endpoint, so clearing it in one place has to reach the other. |
| `SEVERITY` | constant | 2 | `apps/admin/app/_components/notifications/notification-model.ts`:57 | Severity as it is drawn. |
| `TENANT_PANEL_TABS` | constant | 1 | `apps/admin/app/_components/tenants/use-tenant-record-actions.tsx`:21 | Tabs whose content comes from a tenant panel rather than from form fields. |
| `DASHBOARD_WIDGET_REGISTRY` | constant | 0 | `apps/admin/app/_components/dashboard/platform-dashboard.tsx`:183 | Canonical widget capability registry. |
| `RUNTIME_ELEVATED_ROLES` | constant | 0 | `apps/admin/lib/runtime/runtime-permissions.ts`:21 | Roles that reach every platform module regardless of the granted key set. |
| `Notification` | type | 0 | `apps/admin/app/_components/notifications/notification-model.ts`:11 | One row of the feed, as `platform-notifications.ts` projects it. |
| `OverviewIncident` | type | 0 | `apps/admin/app/_components/monitoring/monitoring-overview.tsx`:39 | Monitoring, as a place to start work rather than a place to read numbers. |
| `PlanPriceLike` | type | 0 | `apps/admin/lib/runtime/plan-headline-prices.ts`:43 | The one monthly/annual pair a plan's headline tiles may show. |
| `TenantWorkspaceHealth` | type | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:174 | What is missing from a workspace, as facts about the tenant rather than about a provisioning run that may never have been recorded. |

### Tenant product kit — `apps/web`

Metadata-driven UI is the default. New modules are declared through `lib/runtime/` and rendered by the standard runtime pages; a bespoke page needs a stated reason in the plan.

143 documented export(s); 564 undocumented export(s) omitted.

| Export | Kind | Used by | Where | What it is |
|---|---|---|---|---|
| `ChartEmpty` | component | 7 | `apps/web/app/components/charts/chart-chrome.tsx`:364 | What a chart shows when it has nothing to show. |
| `ConfirmDialog` | component | 7 | `apps/web/app/components/feedback/confirm-dialog.tsx`:41 | This handled Escape but declared neither `role="dialog"` nor `aria-modal`, so it was not announced as a dialog, and Tab walked out of it into the page behind. |
| `ChartSurface` | component | 4 | `apps/web/app/components/charts/chart-chrome.tsx`:146 | The SVG canvas. `role` is deliberately conditional. |
| `ChartCategoryAxis` | component | 3 | `apps/web/app/components/charts/chart-chrome.tsx`:238 | Category labels along the bottom. |
| `ChartValueGrid` | component | 3 | `apps/web/app/components/charts/chart-chrome.tsx`:182 | Horizontal gridlines and their value labels. |
| `AttendanceCorrectionForm` | component | 2 | `apps/web/app/components/attendance-corrections/attendance-correction-form.tsx`:38 | The employee's correction request form. |
| `ChartPatternDefs` | component | 2 | `apps/web/app/components/charts/chart-chrome.tsx`:69 | One `<pattern>` per series: the series colour, overlaid with a hatch whose geometry differs per index. |
| `AttendanceActionFeedback` | component | 1 | `apps/web/app/components/runtime/attendance-action-feedback.tsx`:15 | The contextual answer to an attendance attempt. |
| `AttendanceCorrectionPanel` | component | 1 | `apps/web/app/components/attendance-corrections/attendance-correction-panel.tsx`:29 | Raising a correction against the record the employee is already reading. |
| `ChartLegend` | component | 1 | `apps/web/app/components/charts/chart-chrome.tsx`:301 | The legend. A list, not a row of divs, because it is a list — and because that is what lets a screen reader announce how many series there are before reading them. |
| `DialogCloseButton` | component | 1 | `apps/web/app/components/ui/dialog.tsx`:374 | The close affordance most dialogs want in their footer or header. |
| `GeofenceMap` | component | 1 | `apps/web/app/components/location/geofence-map.tsx`:37 | A minimal slippy map: raster tiles, one pin, one radius circle. |
| `InheritedOptionChoices` | component | 1 | `apps/web/app/components/runtime/inherited-setting-control.tsx`:132 | The radio group an overridden value itself is chosen with. |
| `InheritedSettingControl` | component | 1 | `apps/web/app/components/runtime/inherited-setting-control.tsx`:18 | "Use the inherited value" versus "Override here", made explicit. |
| `LocationGeofencePicker` | component | 1 | `apps/web/app/components/location/location-geofence-picker.tsx`:51 | Pin, geofence circle and radius, as one control. |
| `ModuleShareDialog` | component | 1 | `apps/web/app/components/runtime/module-share-dialog.tsx`:12 | Escape did nothing here and `aria-labelledby` named nothing; the read-only link input carried no accessible name at all. |
| `SessionExpiredDialog` | component | 1 | `apps/web/app/components/feedback/session-expired-dialog.tsx`:16 | This had no dialog semantics, no focus containment and no Escape at all — which for this one is partly deliberate: there is nothing behind it the user can usefully do. |
| `WorkspaceEnvironmentBanner` | component | 1 | `apps/web/app/components/workspace-environment-banner.tsx`:38 | A persistent marker on non-production workspaces. |
| `WorkspaceContextLabel` | component | 0 | `apps/web/app/components/workspace-environment-banner.tsx`:66 | The workspace label for the app shell. |
| `useFormattingContext` | function | 19 | `apps/web/app/components/filters/use-formatting-context.ts`:28 | The tenant's formatting context, safe to use during render. |
| `useDialogBehavior` | function | 16 | `apps/web/app/components/ui/dialog.tsx`:130 | The behaviour half of {@link Dialog}, on its own. |
| `formatChartValue` | function | 10 | `apps/web/app/components/charts/chart-format.ts`:47 | Render one measured number the way the tenant has asked for numbers to be rendered. |
| `hasChartData` | function | 8 | `apps/web/app/components/charts/chart-types.ts`:97 | `true` when there is nothing to draw: no series, or every series empty. |
| `pointAccessibleLabel` | function | 6 | `apps/web/app/components/charts/chart-format.ts`:128 | The accessible name for a single plotted point — the BUG-2148 countermeasure. |
| `seriesColor` | function | 6 | `apps/web/app/components/charts/chart-tokens.ts`:62 | Colour for the series (or slice) at `index`, wrapping when there are more series than colours. |
| `activateOnKey` | function | 4 | `apps/web/app/components/charts/chart-chrome.tsx`:392 | Keyboard activation for a plotted point. |
| `analyticsFilterHref` | function | 4 | `apps/web/app/components/filters/analytics-search-params.ts`:207 | Build an href, omitting the `?` when there is nothing to put after it — `/reports/attendance?` is an ugly URL that also breaks naive link equality checks in navigation highlighting. |
| `applyAnalyticsFilters` | function | 4 | `apps/web/app/components/filters/analytics-search-params.ts`:149 | Apply changes to a query string, returning a new one. |
| `formatShare` | function | 4 | `apps/web/app/components/charts/chart-format.ts`:98 | A proportion, rendered. |
| `linearScale` | function | 4 | `apps/web/app/components/charts/chart-geometry.ts`:67 | A linear mapping from a data domain onto a pixel range. |
| `pointActionAccessibleLabel` | function | 4 | `apps/web/app/components/charts/chart-format.ts`:164 | The accessible name for an interactive point. |
| `readAnalyticsFilters` | function | 4 | `apps/web/app/components/filters/analytics-search-params.ts`:115 | Read the recognised filters out of a URL, ignoring everything else. |
| `seriesExtent` | function | 4 | `apps/web/app/components/charts/chart-geometry.ts`:1197 | The `[min, max]` across every point of every series, always including zero. |
| `buildLinePath` | function | 3 | `apps/web/app/components/charts/chart-geometry.ts`:552 | An SVG `d` for a polyline through `points`, in data space, mapped by the given scales. |
| `computeShares` | function | 3 | `apps/web/app/components/charts/chart-geometry.ts`:876 | Percentage shares that add up. |
| `formatPeriodLabel` | function | 3 | `apps/web/app/components/filters/period.ts`:507 | A period, written out for a person, in the tenant's date format. |
| `isVisibleByRules` | function | 3 | `apps/web/lib/runtime/visibility.resolver.ts`:57 | True when every rule passes. |
| `niceTicks` | function | 3 | `apps/web/app/components/charts/chart-geometry.ts`:160 | Axis ticks a person would have chosen: round steps, covering `[min, max]`, roughly `count` of them. "Roughly" is honest — the returned length is usually `count` or `count + 1` and is never forced, because forcing an exact count is what produces axes labelled 0, 23.75, 47.5, 71.25, 95. |
| `resolveComparison` | function | 3 | `apps/web/app/components/filters/period.ts`:429 | The window a period should be measured against. |
| `resolvePeriod` | function | 3 | `apps/web/app/components/filters/period.ts`:329 | Turn a preset into a concrete inclusive date range. |
| `resolvePlotArea` | function | 3 | `apps/web/app/components/charts/chart-geometry.ts`:229 | The drawable rectangle inside a viewBox once axis gutters are removed. |
| `useChartIdPrefix` | function | 3 | `apps/web/app/components/charts/chart-chrome.tsx`:51 | A stable, per-instance id prefix for SVG defs. |
| `buildAreaPath` | function | 2 | `apps/web/app/components/charts/chart-geometry.ts`:592 | The same shape, closed down to a baseline so it can be filled. |
| `collapseToTopN` | function | 2 | `apps/web/app/components/charts/chart-geometry.ts`:791 | Sort descending and roll everything past the first `limit` into one bucket. |
| `periodLengthInDays` | function | 2 | `apps/web/app/components/filters/period.ts`:404 | Inclusive day count. A single-day period is 1, never 0. |
| `useSideToast` | function | 2 | `apps/web/app/components/notifications/use-side-toast.tsx`:19 | Local toast state plus the element that renders it. |
| `activeAnalyticsFilterCount` | function | 1 | `apps/web/app/components/filters/analytics-search-params.ts`:196 | How many scope filters are narrowing the data. |
| `buildQuickCreateValues` | function | 1 | `apps/web/lib/runtime/related-record-create-values.ts`:56 | The dialog's value map, in precedence order: declared inheritance from the parent, then the record being edited, then whatever the user has typed, then the parent foreign key — which is not the user's to change. |
| `buildSubgridQuickCreate` | function | 1 | `apps/web/lib/runtime/quick-create-metadata.ts`:23 | Quick-create metadata and the gate in front of it. |
| `clearAnalyticsFilters` | function | 1 | `apps/web/app/components/filters/analytics-search-params.ts`:175 | Drop every filter this module owns, keeping anything it does not. |
| `commandContextSubtitle` | function | 1 | `apps/web/lib/runtime/command-context-labels.ts`:25 | A shift is only ever called a shift, and a work site only ever a work site. |
| `commandsForPlacement` | function | 1 | `apps/web/lib/runtime/command-catalog.ts`:191 | Commands that make sense on a given bar, for filtering the picker. |
| `correctionChanges` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:530 | What a correction request is asking to change, and only that. |
| `donutArcs` | function | 1 | `apps/web/app/components/charts/chart-geometry.ts`:1119 | Arc paths for a donut, in input order. |
| `emptyStateMessage` | function | 1 | `apps/web/app/components/data-table/utils.ts`:274 | Which empty state is true. |
| `fieldValidationErrorsAreVisible` | function | 1 | `apps/web/lib/runtime/command-failure-visibility.ts`:20 | Whether a failed command's field errors will actually appear somewhere the user can see them. |
| `filterToFormFields` | function | 1 | `apps/web/lib/runtime/related-record-create-values.ts`:76 | Drop anything the child form does not declare, which is what gets posted. |
| `funnelStages` | function | 1 | `apps/web/app/components/charts/chart-geometry.ts`:980 | Per-stage width and step-to-step conversion for a funnel. |
| `hasRequestedChange` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:478 | Whether a seeded draft actually asks for anything. |
| `otherBucketLabel` | function | 1 | `apps/web/app/components/charts/chart-tokens.ts`:166 | The bucket's label carries the count, because "Other" alone hides whether the reader is looking at two rolled-up rows or two hundred. |
| `resolveAnalyticsPeriod` | function | 1 | `apps/web/app/components/filters/analytics-search-params.ts`:236 | The single interpretation of a URL's period, used by both the filter bar and whatever loads the data. |
| `resolveCommandFailureMessage` | function | 1 | `apps/web/lib/runtime/command-failure-message.ts`:63 | The one line a user reads when a runtime command fails. |
| `resolveInheritedParentValues` | function | 1 | `apps/web/lib/runtime/related-record-create-values.ts`:35 | The subset of a parent record a subgrid has declared its children inherit. |
| `seedDraftFromEntry` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:454 | A draft that opens showing what the record already says. |
| `stackedExtent` | function | 1 | `apps/web/app/components/charts/chart-geometry.ts`:759 | The `[min, max]` a stacked chart's value axis must cover. |
| `stackSeries` | function | 1 | `apps/web/app/components/charts/chart-geometry.ts`:686 | Turn parallel series into cumulative segments, one column per point key. |
| `suggestedGranularity` | function | 1 | `apps/web/app/components/filters/period.ts`:489 | The bucket size a period should be charted at. |
| `summarizeChartShape` | function | 1 | `apps/web/app/components/charts/chart-format.ts`:208 | A one-line summary of what a chart contains, for the caption beneath it. |
| `toLocalDateTimeInput` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:399 | An ISO instant as a `datetime-local` input value, in the viewer's own zone. |
| `validateDraft` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:206 | Checks a draft before it is sent. |
| `bucketByPeriod` | function | 0 | `apps/web/app/components/charts/chart-geometry.ts`:454 | Group dated measurements into calendar buckets, summing each bucket. |
| `donutLegendItems` | function | 0 | `apps/web/app/components/charts/donut-chart.tsx`:185 | Legend entries for a donut, in the same order and with the same bucketing the chart used. |
| `entryAttendanceDate` | function | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:384 | The day the record belongs to, as YYYY-MM-DD. |
| `fieldsFor` | function | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:100 | The fields a given correction type actually uses. |
| `formatTimeBucketLabel` | function | 0 | `apps/web/app/components/charts/chart-format.ts`:182 | A time bucket's axis label, in the tenant's date format where that is meaningful. |
| `formatValue` | function | 0 | `apps/web/app/components/dashboard/dashboard-widget-renderer.tsx`:540 | Exported only for `dashboard-widget-formatting.spec.ts` — `apps/web` has no jsdom, so this is the widest surface this app's jest can reach directly rather than reading the source for a string. |
| `inferCorrectionType` | function | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:435 | The correction this record most likely needs. |
| `normalizeRange` | function | 0 | `apps/web/app/components/filters/period.ts`:298 | Put a pair of dates the right way round. |
| `polarToCartesian` | function | 0 | `apps/web/app/components/charts/chart-geometry.ts`:1046 | Polar to Cartesian in SVG's coordinate space: `y` grows downward, so a clockwise sweep from twelve o'clock is `(cx + r·sin a, cy − r·cos a)`. |
| `readFieldErrorNames` | function | 0 | `apps/web/lib/runtime/command-failure-visibility.ts`:39 | Field names from either supported error shape, at the root or under `details`. |
| `resolveVisibleByRules` | function | 0 | `apps/web/lib/runtime/visibility.resolver.ts`:84 | Filters any list of rule-carrying items. |
| `sparklineAriaLabel` | function | 0 | `apps/web/app/components/charts/sparkline.tsx`:169 | A ready-made `ariaLabel` for the common case: a metric over a period. |
| `startOfWeek` | function | 0 | `apps/web/app/components/filters/period.ts`:468 | Start of the week containing `date`. |
| `tenantToday` | function | 0 | `apps/web/app/components/filters/period.ts`:237 | The calendar date it is *right now, where the tenant is*. |
| `truncateLabel` | function | 0 | `apps/web/app/components/charts/chart-chrome.tsx`:276 | SVG has no text overflow, so a long department name runs off the canvas and over the next chart. |
| `ThemeApplier` | value | 1 | `apps/web/app/components/theme/theme-applier.tsx`:18 | Re-asserts the user's theme after hydration, everywhere in the app. |
| `CHART_FOCUSABLE_CLASS` | constant | 4 | `apps/web/app/components/charts/chart-chrome.tsx`:408 | The focus ring for an in-SVG target. |
| `CHART_VIEWBOX_WIDTH` | constant | 3 | `apps/web/app/components/charts/chart-chrome.tsx`:39 | The nominal drawing width. |
| `MAX_CHART_SLICES` | constant | 3 | `apps/web/app/components/charts/chart-tokens.ts`:157 | Beyond seven slices a ranked proportion chart stops ranking anything: the tail is a row of indistinguishable slivers and the legend is longer than the chart. |
| `PERIOD_PRESET_OPTIONS` | constant | 3 | `apps/web/app/components/filters/period.ts`:90 | Labels for the preset dropdown. "This month", "This quarter" and "Year to date" are *to date* — they end today, not at the end of the calendar period. |
| `CHART_GRID_OPACITY` | constant | 1 | `apps/web/app/components/charts/chart-tokens.ts`:192 | Axis, gridline and baseline strokes. |
| `CHART_PATTERN_OVERLAY` | constant | 1 | `apps/web/app/components/charts/chart-tokens.ts`:203 | The hatch drawn over a series colour to give it a shape as well as a hue. |
| `COMMAND_ICON_CHOICES` | constant | 1 | `apps/web/lib/runtime/command-catalog.ts`:205 | Icons offered in the picker. |
| `COMMAND_PLACEMENTS` | constant | 1 | `apps/web/lib/runtime/command-catalog.ts`:22 | Where an action bar shows up, in the words someone configuring it would use. "Scope" on its own told an administrator nothing about whether they were editing the toolbar above a list, the one on an open record, or the menu that appears once rows are ticked. |
| `MAX_OVERTIME_MINUTES` | constant | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:297 | A day's worth. Beyond this the request is a data-entry error, not overtime. |
| `MIN_VISIBLE_SHARE_PERCENT` | constant | 1 | `apps/web/app/components/charts/chart-tokens.ts`:183 | A slice worth 0.04% of the total is worth nothing at all on screen, but a zero-width bar reads as missing data rather than as a small value. |
| `MISSING_VALUE_TEXT` | constant | 1 | `apps/web/app/components/charts/chart-format.ts`:38 | What a missing or unmeasurable number reads as. |
| `OTHER_BUCKET_KEY` | constant | 1 | `apps/web/app/components/charts/chart-tokens.ts`:160 | Reserved key for the rolled-up tail. |
| `REQUESTABLE_WORK_MODES` | constant | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:42 | Modes a single correction may request. |
| `SCOPE_FILTER_PARAMS` | constant | 1 | `apps/web/app/components/filters/analytics-search-params.ts`:64 | The organisational narrowing parameters, as distinct from the period and the grouping. |
| `VALUELESS_FILTER_OPERATORS` | constant | 1 | `apps/web/app/components/data-table/types.ts`:31 | Operators that compare nothing, so the value input is hidden for them. |
| `ANALYTICS_FILTER_PARAMS` | constant | 0 | `apps/web/app/components/filters/analytics-search-params.ts`:38 | The parameter names, as a fixed contract. |
| `AREA_CHART_MARGINS` | constant | 0 | `apps/web/app/components/charts/area-chart.tsx`:43 | A trend with the volume under it filled in. |
| `BAR_CHART_MARGINS` | constant | 0 | `apps/web/app/components/charts/bar-chart.tsx`:46 | Vertical bars, grouped or stacked. |
| `CHART_PATTERN_GEOMETRIES` | constant | 0 | `apps/web/app/components/charts/chart-tokens.ts`:93 | BUG-2148 — severity was conveyed by colour alone and hidden from assistive technology. |
| `CHART_SERIES_COLORS` | constant | 0 | `apps/web/app/components/charts/chart-tokens.ts`:44 | The one palette every chart in the Reports & Analytics workspace draws from. |
| `DEFAULT_WEEK_STARTS_ON` | constant | 0 | `apps/web/app/components/charts/chart-geometry.ts`:345 | `weekStartsOn` is a parameter and not a constant on purpose. |
| `DEFAULT_WEEK_STARTS_ON` | constant | 0 | `apps/web/app/components/filters/period.ts`:130 | Sunday. This product's default weekend is **Friday/Saturday**, so the working week begins on Sunday and not on Monday. |
| `LINE_CHART_MARGINS` | constant | 0 | `apps/web/app/components/charts/line-chart.tsx`:36 | A trend over time. A thin renderer: every number on screen was computed by `chart-geometry.ts` and every string was formatted by `chart-format.ts`, both of which are covered by specs. |
| `VisibilityRule` | type | 5 | `apps/web/lib/runtime/visibility.resolver.ts`:27 | One place to ask "should this person see this". |
| `ChartValueFormat` | type | 3 | `apps/web/app/components/charts/chart-types.ts`:50 | How a raw number should read once it reaches a person. |
| `ChartGranularity` | type | 2 | `apps/web/app/components/charts/chart-types.ts`:85 | Time bucketing granularity for `bucketByPeriod`. |
| `ChartSeries` | type | 2 | `apps/web/app/components/charts/chart-types.ts`:35 | A named run of points. |
| `ModuleViewSelectorConfig` | type | 2 | `apps/web/app/components/runtime/module-view-selector.tsx`:48 | The server-side shape pages pass through; kept for callers that build it. |
| `AttendanceEntrySeed` | type | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:347 | The attendance record a correction can be seeded from. |
| `ChartPoint` | type | 1 | `apps/web/app/components/charts/chart-types.ts`:27 | One measured value. `key` identifies the point for React keys, drill-down and stacking across series; it is a record id or a stable slug, never a display string. |
| `ModuleViewType` | type | 1 | `apps/web/app/components/runtime/module-view-selector.tsx`:15 | The one view selector. |
| `AnalyticsScopeFilter` | type | 0 | `apps/web/app/components/filters/analytics-filter-bar.tsx`:39 | The filter bar for every analytics screen. |
| `AnalyticsSearchParamsInput` | type | 0 | `apps/web/app/components/filters/analytics-search-params.ts`:79 | Next's `searchParams` prop, or a real `URLSearchParams`, or a query string. |
| `AudienceOption` | type | 0 | `apps/web/app/components/runtime/visibility-rules-editor.tsx`:24 | One editor for audience rules, shared by every designer that gates a surface. |
| `BaseChartProps` | type | 0 | `apps/web/app/components/charts/chart-types.ts`:63 | Props shared by every chart component in this directory. |
| `ChartFrameProps` | type | 0 | `apps/web/app/components/charts/chart-frame.tsx`:35 | The wrapper that makes a chart a complete thing rather than a picture. |
| `CollapsedPoint` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:773 | ------------------------------------------------------- ranked proportions |
| `CommandContextSource` | type | 0 | `apps/web/lib/runtime/command-context-labels.ts`:14 | Labels for the context line a command surface shows above its form. |
| `CommandFailureContract` | type | 0 | `apps/web/lib/runtime/command-failure-message.ts`:22 | What a failed runtime command means, read out of whatever the adapter threw. |
| `CommandPlacementKey` | type | 0 | `apps/web/lib/runtime/command-catalog.ts`:9 | The commands an action bar can carry, and where a bar can appear. |
| `ComparisonSelectorProps` | type | 0 | `apps/web/app/components/filters/comparison-selector.tsx`:31 | What the current period is measured against. |
| `CorrectionOriginals` | type | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:361 | The values the record already holds, as the correction form's own vocabulary. |
| `CorrectionType` | type | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:15 | Which fields a correction type needs, and what makes a request valid. |
| `DateRange` | type | 0 | `apps/web/app/components/filters/period.ts`:38 | Inclusive, `yyyy-MM-dd` at both ends. |
| `DateRangeFilterValue` | type | 0 | `apps/web/app/components/filters/date-range-filter.tsx`:32 | Preset first, custom dates second. |
| `DonutArc` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:1029 | ------------------------------------------------------------------- donut |
| `DonutChartProps` | type | 0 | `apps/web/app/components/charts/donut-chart.tsx`:37 | A composition, as a ring. |
| `FunnelChartProps` | type | 0 | `apps/web/app/components/charts/funnel-chart.tsx`:26 | A pipeline, stage by stage. |
| `FunnelStage` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:954 | ------------------------------------------------------------------ funnel |
| `GovernedInputRequest` | type | 0 | `apps/web/app/components/feedback/use-governed-input.tsx`:37 | Collect a governed value through the design system, instead of `window.prompt`. |
| `HorizontalBarListProps` | type | 0 | `apps/web/app/components/charts/horizontal-bar-list.tsx`:43 | Ranked proportions: "how is this split up, and what is at the top". |
| `Point2D` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:33 | Every calculation a chart in this directory performs, with no React in sight. |
| `QuickCreateSubmission` | type | 0 | `apps/web/lib/runtime/quick-create-metadata.ts`:130 | Whether a quick-create dialog may submit, and what to say when it may not. |
| `RuntimeTabContentContext` | type | 0 | `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`:65 | What a purpose-built tab body gets to work with. |
| `SparklineProps` | type | 0 | `apps/web/app/components/charts/sparkline.tsx`:31 | A trend at the size of a word. |
| `StackedSegment` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:650 | ------------------------------------------------------------------ stacks |
| `TimeSeriesPoint` | type | 0 | `apps/web/app/components/charts/chart-geometry.ts`:247 | ------------------------------------------------------------ time buckets |

### Shared package — NOT the design system — `packages/ui`

Button, card and code only. This is not the design system and importing from it in an app is almost always wrong — use the app kit above.

_No documented exports found._

## Where this does not reach

- **Runtime registries are declarations, not components.** The admin command
  bar's contents come from `platform-module-registry.ts`, not from
  `ModuleActionBar` — the component renders what the registry declares. See
  `.agent/context/runtime-module-system.md` for that contract.
- **Bespoke screens are not kit.** A page component under a route group is
  outside these directories by design; this indexes what is meant to be reused.
- **Styling tokens are not here.** `.agent/context/ui-design-system.md` holds
  the theming boundary, the Tailwind v4 setup and the known exceptions.
