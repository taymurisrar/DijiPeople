# Component Index

> **Last verified:** 2026-08-28
> **Verified against commit:** 1003a2ac
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

**An export missing from here is undocumented, not absent.** 757 of
862 exports across these kits carry no
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

68 documented export(s); 244 undocumented export(s) omitted.

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
| `PlanCommercialSummary` | component | 1 | `apps/admin/app/_components/plans/plan-commercial-summary.tsx`:28 | What this plan currently costs and who is on it. |
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
| `TenantControlPlaneError` | component | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:506 | An API failure with the context needed to chase it. |
| `useTenantResource` | function | 10 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:600 | Load one tab's data. Every tab owns its own request and is only fired when that tab is opened, so arriving on Overview does not pull Commercial, Apps and Operations with it. |
| `relativeTime` | function | 5 | `apps/admin/app/_components/tenants/tenant-panel-ui.tsx`:405 | Relative time for heartbeat and last-seen columns. |
| `runStandardRecordCommand` | function | 4 | `apps/admin/lib/runtime/standard-record-commands.ts`:23 | Back, New and Refresh for the record pages that are **not** the runtime. |
| `useReasonPrompt` | function | 3 | `apps/admin/app/_components/runtime/use-reason-prompt.tsx`:62 | Collects a governed reason through the design system instead of `window.prompt` (BUG-0020). |
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
| `isTransportFailure` | function | 1 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:677 | Whether a failure means "the request never got an answer" rather than "the server said no". |
| `planEntitlementKeys` | function | 1 | `apps/admin/lib/runtime/plan-entitlement-keys.ts`:29 | The entitlement keys a plan record grants, whatever shape the record is in. |
| `readRuntimeLookupLabel` | function | 1 | `apps/admin/lib/runtime/runtime-lookups.ts`:138 | The display name of a related record, wherever this schema happens to keep it. |
| `reconcileWithErasureReceipt` | function | 1 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:702 | Ask the receipt what happened when the response did not arrive. |
| `recordHeaderWritePermission` | function | 1 | `apps/admin/lib/runtime/runtime-permissions.ts`:54 | The permission a header slot's write route is governed by. |
| `useTenantRecordActions` | function | 1 | `apps/admin/app/_components/tenants/use-tenant-record-actions.tsx`:99 | Routes tenant action-bar requests to whichever surface owns the change. |
| `acceptsField` | function | 0 | `apps/admin/lib/runtime/runtime-write-payload.ts`:20 | Whether the runtime will accept this field on this kind of write. |
| `fetchErasureReceipts` | function | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:657 | Erasure receipts for one tenant, read without addressing the tenant itself. |
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
| `TenantWorkspaceHealth` | type | 0 | `apps/admin/app/_components/tenants/tenant-control-plane.client.ts`:174 | What is missing from a workspace, as facts about the tenant rather than about a provisioning run that may never have been recorded. |

### Tenant product kit — `apps/web`

Metadata-driven UI is the default. New modules are declared through `lib/runtime/` and rendered by the standard runtime pages; a bespoke page needs a stated reason in the plan.

37 documented export(s); 510 undocumented export(s) omitted.

| Export | Kind | Used by | Where | What it is |
|---|---|---|---|---|
| `ConfirmDialog` | component | 7 | `apps/web/app/components/feedback/confirm-dialog.tsx`:41 | This handled Escape but declared neither `role="dialog"` nor `aria-modal`, so it was not announced as a dialog, and Tab walked out of it into the page behind. |
| `AttendanceActionFeedback` | component | 1 | `apps/web/app/components/runtime/attendance-action-feedback.tsx`:15 | The contextual answer to an attendance attempt. |
| `AttendanceCorrectionForm` | component | 1 | `apps/web/app/components/attendance-corrections/attendance-correction-form.tsx`:32 | The employee's correction request form. |
| `DialogCloseButton` | component | 1 | `apps/web/app/components/ui/dialog.tsx`:374 | The close affordance most dialogs want in their footer or header. |
| `GeofenceMap` | component | 1 | `apps/web/app/components/location/geofence-map.tsx`:37 | A minimal slippy map: raster tiles, one pin, one radius circle. |
| `InheritedOptionChoices` | component | 1 | `apps/web/app/components/runtime/inherited-setting-control.tsx`:132 | The radio group an overridden value itself is chosen with. |
| `InheritedSettingControl` | component | 1 | `apps/web/app/components/runtime/inherited-setting-control.tsx`:18 | "Use the inherited value" versus "Override here", made explicit. |
| `LocationGeofencePicker` | component | 1 | `apps/web/app/components/location/location-geofence-picker.tsx`:51 | Pin, geofence circle and radius, as one control. |
| `ModuleShareDialog` | component | 1 | `apps/web/app/components/runtime/module-share-dialog.tsx`:12 | Escape did nothing here and `aria-labelledby` named nothing; the read-only link input carried no accessible name at all. |
| `SessionExpiredDialog` | component | 1 | `apps/web/app/components/feedback/session-expired-dialog.tsx`:16 | This had no dialog semantics, no focus containment and no Escape at all — which for this one is partly deliberate: there is nothing behind it the user can usefully do. |
| `WorkspaceEnvironmentBanner` | component | 1 | `apps/web/app/components/workspace-environment-banner.tsx`:38 | A persistent marker on non-production workspaces. |
| `WorkspaceSwitcher` | component | 1 | `apps/web/app/components/workspace-switcher.tsx`:34 | Moving between the workspaces one person belongs to. |
| `WorkspaceContextLabel` | component | 0 | `apps/web/app/components/workspace-environment-banner.tsx`:66 | The workspace label for the app shell. |
| `useDialogBehavior` | function | 16 | `apps/web/app/components/ui/dialog.tsx`:130 | The behaviour half of {@link Dialog}, on its own. |
| `isVisibleByRules` | function | 3 | `apps/web/lib/runtime/visibility.resolver.ts`:57 | True when every rule passes. |
| `commandContextSubtitle` | function | 1 | `apps/web/lib/runtime/command-context-labels.ts`:25 | A shift is only ever called a shift, and a work site only ever a work site. |
| `commandsForPlacement` | function | 1 | `apps/web/lib/runtime/command-catalog.ts`:191 | Commands that make sense on a given bar, for filtering the picker. |
| `emptyStateMessage` | function | 1 | `apps/web/app/components/data-table/utils.ts`:274 | Which empty state is true. |
| `useSideToast` | function | 1 | `apps/web/app/components/notifications/use-side-toast.tsx`:19 | Local toast state plus the element that renders it. |
| `validateDraft` | function | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:191 | Checks a draft before it is sent. |
| `fieldsFor` | function | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:100 | The fields a given correction type actually uses. |
| `resolveVisibleByRules` | function | 0 | `apps/web/lib/runtime/visibility.resolver.ts`:84 | Filters any list of rule-carrying items. |
| `ThemeApplier` | value | 1 | `apps/web/app/components/theme/theme-applier.tsx`:18 | Re-asserts the user's theme after hydration, everywhere in the app. |
| `COMMAND_ICON_CHOICES` | constant | 1 | `apps/web/lib/runtime/command-catalog.ts`:205 | Icons offered in the picker. |
| `COMMAND_PLACEMENTS` | constant | 1 | `apps/web/lib/runtime/command-catalog.ts`:22 | Where an action bar shows up, in the words someone configuring it would use. "Scope" on its own told an administrator nothing about whether they were editing the toolbar above a list, the one on an open record, or the menu that appears once rows are ticked. |
| `MAX_OVERTIME_MINUTES` | constant | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:282 | A day's worth. Beyond this the request is a data-entry error, not overtime. |
| `REQUESTABLE_WORK_MODES` | constant | 1 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:42 | Modes a single correction may request. |
| `VALUELESS_FILTER_OPERATORS` | constant | 1 | `apps/web/app/components/data-table/types.ts`:31 | Operators that compare nothing, so the value input is hidden for them. |
| `VisibilityRule` | type | 5 | `apps/web/lib/runtime/visibility.resolver.ts`:27 | One place to ask "should this person see this". |
| `ModuleViewSelectorConfig` | type | 2 | `apps/web/app/components/runtime/module-view-selector.tsx`:48 | The server-side shape pages pass through; kept for callers that build it. |
| `ModuleViewType` | type | 1 | `apps/web/app/components/runtime/module-view-selector.tsx`:15 | The one view selector. |
| `AudienceOption` | type | 0 | `apps/web/app/components/runtime/visibility-rules-editor.tsx`:24 | One editor for audience rules, shared by every designer that gates a surface. |
| `CommandContextSource` | type | 0 | `apps/web/lib/runtime/command-context-labels.ts`:14 | Labels for the context line a command surface shows above its form. |
| `CommandPlacementKey` | type | 0 | `apps/web/lib/runtime/command-catalog.ts`:9 | The commands an action bar can carry, and where a bar can appear. |
| `CorrectionType` | type | 0 | `apps/web/app/components/attendance-corrections/correction-form-fields.ts`:15 | Which fields a correction type needs, and what makes a request valid. |
| `GovernedInputRequest` | type | 0 | `apps/web/app/components/feedback/use-governed-input.tsx`:37 | Collect a governed value through the design system, instead of `window.prompt`. |
| `RuntimeTabContentContext` | type | 0 | `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`:65 | What a purpose-built tab body gets to work with. |

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
