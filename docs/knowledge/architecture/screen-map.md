---
aliases: [Screen Map]
---

# Screen Map

> **Generated** by `scripts/generate-screen-map.mjs`. Every App Router screen in the frontends, with the API path and entity for those the runtime module system declares. Do not hand-edit.

A screen marked **bespoke** is a hand-written page whose API calls and underlying entity can only be found by reading it. That is not a gap in this generator — it is the actual state of the mapping, and the reason Phase 5 of [[discovery-status]] is not finished. Nothing here is inferred from a route name; a route called `/employees` need not read `Employee`.

## What this map does not tell you

**A route is not a reachable screen.** Verified against the `dijipeople-demo` tenant on 2026-08-30: the workspace navigation offered seven destinations — Overview, Employees, Leave, Attendance, Approvals, Reports, Settings — against 254 routes in `apps/web`. Plan entitlements, permissions and navigation configuration all narrow what a given user can actually get to, and none of that is visible in a file tree. Treat the count below as the surface that exists, not the surface anyone sees.

**`apiPath` is called by the server, not the browser.** Loading `/leaves` on that tenant issued no client-side request to `/api/leave-requests`; the list arrives already rendered, and the only client calls were notifications and settings. Runtime list and record screens fetch through `apps/web/lib/server-api.ts` in a server component. Watching the browser network log to discover which endpoint a screen uses will therefore find nothing, and concluding the screen calls no API would be wrong.

**361 screens** across 3 applications · 11 runtime modules declare an API path and entity

Related: [[domain-map]] · [[data-model-overview]] · [[discovery-status]] · [[known-gaps]]

## Tenant product — `apps/web` (port 3001)

259 screens, 32 runtime-driven.

| Route | Source | API | Entity |
|---|---|---|---|
| `/` | `apps/web/app/(authenticated)/page.tsx` | _bespoke_ | — |
| `/access-denied` | `apps/web/app/(authenticated)/access-denied/page.tsx` | _bespoke_ | — |
| `/activate` | `apps/web/app/(public)/activate/page.tsx` | _bespoke_ | — |
| `/activate-account` | `apps/web/app/activate-account/page.tsx` | _bespoke_ | — |
| `/approvals` | `apps/web/app/(authenticated)/approvals/page.tsx` | `/api/approvals` | `approval` |
| `/approvals/[approvalId]` | `apps/web/app/(authenticated)/approvals/[approvalId]/page.tsx` | `/api/approvals` | `approval` |
| `/attendance` | `apps/web/app/(authenticated)/attendance/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/[entryId]` | `apps/web/app/(authenticated)/attendance/[entryId]/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/[entryId]/edit` | `apps/web/app/(authenticated)/attendance/[entryId]/edit/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/corrections` | `apps/web/app/(authenticated)/attendance/corrections/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/corrections/[id]` | `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/corrections/new` | `apps/web/app/(authenticated)/attendance/corrections/new/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/daily` | `apps/web/app/(authenticated)/attendance/daily/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/exceptions` | `apps/web/app/(authenticated)/attendance/exceptions/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/exceptions/[id]` | `apps/web/app/(authenticated)/attendance/exceptions/[id]/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/new` | `apps/web/app/(authenticated)/attendance/new/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/attendance/team` | `apps/web/app/(authenticated)/attendance/team/page.tsx` | `/api/attendance` | `attendanceEntry` |
| `/benefits/assignments` | `apps/web/app/(authenticated)/benefits/assignments/page.tsx` | _bespoke_ | — |
| `/benefits/assignments/[id]` | `apps/web/app/(authenticated)/benefits/assignments/[id]/page.tsx` | _bespoke_ | — |
| `/benefits/assignments/new` | `apps/web/app/(authenticated)/benefits/assignments/new/page.tsx` | _bespoke_ | — |
| `/business-trips` | `apps/web/app/(authenticated)/business-trips/page.tsx` | _bespoke_ | — |
| `/business-trips/[tripId]` | `apps/web/app/(authenticated)/business-trips/[tripId]/page.tsx` | _bespoke_ | — |
| `/claims` | `apps/web/app/(authenticated)/claims/page.tsx` | _bespoke_ | — |
| `/claims/[claimId]` | `apps/web/app/(authenticated)/claims/[claimId]/page.tsx` | _bespoke_ | — |
| `/customers` | `apps/web/app/(authenticated)/customers/page.tsx` | `/api/customers` | `customer` |
| `/customers/[customerId]` | `apps/web/app/(authenticated)/customers/[customerId]/page.tsx` | `/api/customers` | `customer` |
| `/customers/[customerId]/edit` | `apps/web/app/(authenticated)/customers/[customerId]/edit/page.tsx` | `/api/customers` | `customer` |
| `/customers/new` | `apps/web/app/(authenticated)/customers/new/page.tsx` | `/api/customers` | `customer` |
| `/customization` | `apps/web/app/(authenticated)/customization/page.tsx` | _bespoke_ | — |
| `/dashboard` | `apps/web/app/dashboard/page.tsx` | _bespoke_ | — |
| `/dashboard/[...path]` | `apps/web/app/dashboard/[...path]/page.tsx` | _bespoke_ | — |
| `/dlp-review` | `apps/web/app/(authenticated)/dlp-review/page.tsx` | _bespoke_ | — |
| `/employee-bank-accounts` | `apps/web/app/(authenticated)/employee-bank-accounts/page.tsx` | _bespoke_ | — |
| `/employee-bank-accounts/[id]` | `apps/web/app/(authenticated)/employee-bank-accounts/[id]/page.tsx` | _bespoke_ | — |
| `/employee-bank-accounts/new` | `apps/web/app/(authenticated)/employee-bank-accounts/new/page.tsx` | _bespoke_ | — |
| `/employees` | `apps/web/app/(authenticated)/employees/page.tsx` | _bespoke_ | — |
| `/employees/[employeeId]` | `apps/web/app/(authenticated)/employees/[employeeId]/page.tsx` | _bespoke_ | — |
| `/employees/[employeeId]/edit` | `apps/web/app/(authenticated)/employees/[employeeId]/edit/page.tsx` | _bespoke_ | — |
| `/employees/new` | `apps/web/app/(authenticated)/employees/new/page.tsx` | _bespoke_ | — |
| `/executive/dashboard` | `apps/web/app/(authenticated)/executive/dashboard/page.tsx` | _bespoke_ | — |
| `/hr/dashboard` | `apps/web/app/(authenticated)/hr/dashboard/page.tsx` | _bespoke_ | — |
| `/inbox` | `apps/web/app/(authenticated)/inbox/page.tsx` | _bespoke_ | — |
| `/inbox/[notificationId]` | `apps/web/app/(authenticated)/inbox/[notificationId]/page.tsx` | _bespoke_ | — |
| `/leaves` | `apps/web/app/(authenticated)/leaves/page.tsx` | `/api/leave-requests` | `leaveRequest` |
| `/leaves/[id]` | `apps/web/app/(authenticated)/leaves/[id]/page.tsx` | `/api/leave-requests` | `leaveRequest` |
| `/leaves/approvals` | `apps/web/app/(authenticated)/leaves/approvals/page.tsx` | `/api/leave-requests` | `leaveRequest` |
| `/leaves/new` | `apps/web/app/(authenticated)/leaves/new/page.tsx` | `/api/leave-requests` | `leaveRequest` |
| `/loans` | `apps/web/app/(authenticated)/loans/page.tsx` | _bespoke_ | — |
| `/loans/[id]` | `apps/web/app/(authenticated)/loans/[id]/page.tsx` | _bespoke_ | — |
| `/loans/new` | `apps/web/app/(authenticated)/loans/new/page.tsx` | _bespoke_ | — |
| `/login` | `apps/web/app/(public)/login/page.tsx` | _bespoke_ | — |
| `/manager/dashboard` | `apps/web/app/(authenticated)/manager/dashboard/page.tsx` | _bespoke_ | — |
| `/me` | `apps/web/app/(authenticated)/me/page.tsx` | _bespoke_ | — |
| `/me/business-trips` | `apps/web/app/(authenticated)/me/business-trips/page.tsx` | _bespoke_ | — |
| `/me/business-trips/[tripId]` | `apps/web/app/(authenticated)/me/business-trips/[tripId]/page.tsx` | _bespoke_ | — |
| `/me/claims` | `apps/web/app/(authenticated)/me/claims/page.tsx` | _bespoke_ | — |
| `/me/claims/[claimId]` | `apps/web/app/(authenticated)/me/claims/[claimId]/page.tsx` | _bespoke_ | — |
| `/me/dashboard` | `apps/web/app/(authenticated)/me/dashboard/page.tsx` | _bespoke_ | — |
| `/me/payslips` | `apps/web/app/(authenticated)/me/payslips/page.tsx` | _bespoke_ | — |
| `/me/payslips/[payslipId]` | `apps/web/app/(authenticated)/me/payslips/[payslipId]/page.tsx` | _bespoke_ | — |
| `/my-preferences` | `apps/web/app/(authenticated)/my-preferences/page.tsx` | _bespoke_ | — |
| `/my-profile` | `apps/web/app/(authenticated)/my-profile/page.tsx` | _bespoke_ | — |
| `/onboarding` | `apps/web/app/(authenticated)/onboarding/page.tsx` | `/api/onboarding` | `employeeOnboarding` |
| `/onboarding/[onboardingId]` | `apps/web/app/(authenticated)/onboarding/[onboardingId]/page.tsx` | `/api/onboarding` | `employeeOnboarding` |
| `/partner` | `apps/web/app/partner/page.tsx` | _bespoke_ | — |
| `/partner-login` | `apps/web/app/(public)/partner-login/page.tsx` | _bespoke_ | — |
| `/partner/contracts` | `apps/web/app/partner/contracts/page.tsx` | _bespoke_ | — |
| `/partner/contracts/[contractId]` | `apps/web/app/partner/contracts/[contractId]/page.tsx` | _bespoke_ | — |
| `/partner/leads` | `apps/web/app/partner/leads/page.tsx` | _bespoke_ | — |
| `/partner/leads/[reviewId]` | `apps/web/app/partner/leads/[reviewId]/page.tsx` | _bespoke_ | — |
| `/partner/leads/new` | `apps/web/app/partner/leads/new/page.tsx` | _bespoke_ | — |
| `/partner/profile` | `apps/web/app/partner/profile/page.tsx` | _bespoke_ | — |
| `/partner/referral-links` | `apps/web/app/partner/referral-links/page.tsx` | _bespoke_ | — |
| `/payroll` | `apps/web/app/(authenticated)/payroll/page.tsx` | _bespoke_ | — |
| `/payroll/calendars` | `apps/web/app/(authenticated)/payroll/calendars/page.tsx` | _bespoke_ | — |
| `/payroll/calendars/[calendarId]` | `apps/web/app/(authenticated)/payroll/calendars/[calendarId]/page.tsx` | _bespoke_ | — |
| `/payroll/calendars/[calendarId]/edit` | `apps/web/app/(authenticated)/payroll/calendars/[calendarId]/edit/page.tsx` | _bespoke_ | — |
| `/payroll/calendars/new` | `apps/web/app/(authenticated)/payroll/calendars/new/page.tsx` | _bespoke_ | — |
| `/payroll/compensation` | `apps/web/app/(authenticated)/payroll/compensation/page.tsx` | _bespoke_ | — |
| `/payroll/cycles` | `apps/web/app/(authenticated)/payroll/cycles/page.tsx` | _bespoke_ | — |
| `/payroll/cycles/[cycleId]` | `apps/web/app/(authenticated)/payroll/cycles/[cycleId]/page.tsx` | _bespoke_ | — |
| `/payroll/cycles/[cycleId]/edit` | `apps/web/app/(authenticated)/payroll/cycles/[cycleId]/edit/page.tsx` | _bespoke_ | — |
| `/payroll/cycles/new` | `apps/web/app/(authenticated)/payroll/cycles/new/page.tsx` | _bespoke_ | — |
| `/payroll/dashboard` | `apps/web/app/(authenticated)/payroll/dashboard/page.tsx` | _bespoke_ | — |
| `/payroll/delivery` | `apps/web/app/(authenticated)/payroll/delivery/page.tsx` | _bespoke_ | — |
| `/payroll/delivery-center` | `apps/web/app/(authenticated)/payroll/delivery-center/page.tsx` | _bespoke_ | — |
| `/payroll/employee-compensation` | `apps/web/app/(authenticated)/payroll/employee-compensation/page.tsx` | _bespoke_ | — |
| `/payroll/employee-compensation/[compensationId]` | `apps/web/app/(authenticated)/payroll/employee-compensation/[compensationId]/page.tsx` | _bespoke_ | — |
| `/payroll/employee-compensation/[compensationId]/edit` | `apps/web/app/(authenticated)/payroll/employee-compensation/[compensationId]/edit/page.tsx` | _bespoke_ | — |
| `/payroll/employee-compensation/new` | `apps/web/app/(authenticated)/payroll/employee-compensation/new/page.tsx` | _bespoke_ | — |
| `/payroll/exceptions` | `apps/web/app/(authenticated)/payroll/exceptions/page.tsx` | _bespoke_ | — |
| `/payroll/payslips` | `apps/web/app/(authenticated)/payroll/payslips/page.tsx` | _bespoke_ | — |
| `/payroll/payslips/[payslipId]` | `apps/web/app/(authenticated)/payroll/payslips/[payslipId]/page.tsx` | _bespoke_ | — |
| `/payroll/payslips/delivery` | `apps/web/app/(authenticated)/payroll/payslips/delivery/page.tsx` | _bespoke_ | — |
| `/payroll/periods` | `apps/web/app/(authenticated)/payroll/periods/page.tsx` | _bespoke_ | — |
| `/payroll/periods/[periodId]` | `apps/web/app/(authenticated)/payroll/periods/[periodId]/page.tsx` | _bespoke_ | — |
| `/payroll/periods/[periodId]/edit` | `apps/web/app/(authenticated)/payroll/periods/[periodId]/edit/page.tsx` | _bespoke_ | — |
| `/payroll/periods/new` | `apps/web/app/(authenticated)/payroll/periods/new/page.tsx` | _bespoke_ | — |
| `/payroll/reports` | `apps/web/app/(authenticated)/payroll/reports/page.tsx` | _bespoke_ | — |
| `/payroll/runs` | `apps/web/app/(authenticated)/payroll/runs/page.tsx` | _bespoke_ | — |
| `/payroll/runs/[runId]` | `apps/web/app/(authenticated)/payroll/runs/[runId]/page.tsx` | _bespoke_ | — |
| `/payroll/runs/[runId]/preview` | `apps/web/app/(authenticated)/payroll/runs/[runId]/preview/page.tsx` | _bespoke_ | — |
| `/payroll/runs/new` | `apps/web/app/(authenticated)/payroll/runs/new/page.tsx` | _bespoke_ | — |
| `/profile` | `apps/web/app/(authenticated)/profile/page.tsx` | _bespoke_ | — |
| `/projects` | `apps/web/app/(authenticated)/projects/page.tsx` | `/api/projects` | `project` |
| `/projects/[projectId]` | `apps/web/app/(authenticated)/projects/[projectId]/page.tsx` | `/api/projects` | `project` |
| `/projects/[projectId]/edit` | `apps/web/app/(authenticated)/projects/[projectId]/edit/page.tsx` | `/api/projects` | `project` |
| `/projects/new` | `apps/web/app/(authenticated)/projects/new/page.tsx` | `/api/projects` | `project` |
| `/recruitment` | `apps/web/app/(authenticated)/recruitment/page.tsx` | _bespoke_ | — |
| `/recruitment/applications` | `apps/web/app/(authenticated)/recruitment/applications/page.tsx` | _bespoke_ | — |
| `/recruitment/applications/[applicationId]` | `apps/web/app/(authenticated)/recruitment/applications/[applicationId]/page.tsx` | _bespoke_ | — |
| `/recruitment/candidates` | `apps/web/app/(authenticated)/recruitment/candidates/page.tsx` | _bespoke_ | — |
| `/recruitment/candidates/[candidateId]` | `apps/web/app/(authenticated)/recruitment/candidates/[candidateId]/page.tsx` | _bespoke_ | — |
| `/recruitment/candidates/[candidateId]/edit` | `apps/web/app/(authenticated)/recruitment/candidates/[candidateId]/edit/page.tsx` | _bespoke_ | — |
| `/recruitment/candidates/new` | `apps/web/app/(authenticated)/recruitment/candidates/new/page.tsx` | _bespoke_ | — |
| `/recruitment/candidates/upload-cv` | `apps/web/app/(authenticated)/recruitment/candidates/upload-cv/page.tsx` | _bespoke_ | — |
| `/recruitment/employee-drafts/[employeeId]` | `apps/web/app/(authenticated)/recruitment/employee-drafts/[employeeId]/page.tsx` | _bespoke_ | — |
| `/recruitment/jobs` | `apps/web/app/(authenticated)/recruitment/jobs/page.tsx` | _bespoke_ | — |
| `/recruitment/jobs/[jobId]` | `apps/web/app/(authenticated)/recruitment/jobs/[jobId]/page.tsx` | _bespoke_ | — |
| `/recruitment/jobs/[jobId]/edit` | `apps/web/app/(authenticated)/recruitment/jobs/[jobId]/edit/page.tsx` | _bespoke_ | — |
| `/recruitment/jobs/new` | `apps/web/app/(authenticated)/recruitment/jobs/new/page.tsx` | _bespoke_ | — |
| `/recruitment/pipelines` | `apps/web/app/(authenticated)/recruitment/pipelines/page.tsx` | _bespoke_ | — |
| `/recruitment/talent-pool` | `apps/web/app/(authenticated)/recruitment/talent-pool/page.tsx` | _bespoke_ | — |
| `/reports` | `apps/web/app/(authenticated)/reports/page.tsx` | _bespoke_ | — |
| `/reports/analytics/[surface]` | `apps/web/app/(authenticated)/reports/analytics/[surface]/page.tsx` | _bespoke_ | — |
| `/reports/builder` | `apps/web/app/(authenticated)/reports/builder/page.tsx` | _bespoke_ | — |
| `/reports/library` | `apps/web/app/(authenticated)/reports/library/page.tsx` | _bespoke_ | — |
| `/reports/my-reports` | `apps/web/app/(authenticated)/reports/my-reports/page.tsx` | _bespoke_ | — |
| `/reports/scheduled` | `apps/web/app/(authenticated)/reports/scheduled/page.tsx` | _bespoke_ | — |
| `/reset-password` | `apps/web/app/(public)/reset-password/page.tsx` | _bespoke_ | — |
| `/settings` | `apps/web/app/(authenticated)/settings/page.tsx` | _bespoke_ | — |
| `/settings/[category]` | `apps/web/app/(authenticated)/settings/[category]/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]/[item]` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/[item]/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]/[item]/[id]` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/[item]/[id]/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]/[item]/[id]/edit` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/[item]/[id]/edit/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]/[item]/manage` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/[item]/manage/page.tsx` | _bespoke_ | — |
| `/settings/[category]/[settingGroup]/[item]/new` | `apps/web/app/(authenticated)/settings/[category]/[settingGroup]/[item]/new/page.tsx` | _bespoke_ | — |
| `/settings/access` | `apps/web/app/(authenticated)/settings/access/page.tsx` | _bespoke_ | — |
| `/settings/access/roles` | `apps/web/app/(authenticated)/settings/access/roles/page.tsx` | _bespoke_ | — |
| `/settings/access/roles/[roleId]` | `apps/web/app/(authenticated)/settings/access/roles/[roleId]/page.tsx` | _bespoke_ | — |
| `/settings/access/teams` | `apps/web/app/(authenticated)/settings/access/teams/page.tsx` | _bespoke_ | — |
| `/settings/access/users` | `apps/web/app/(authenticated)/settings/access/users/page.tsx` | _bespoke_ | — |
| `/settings/access/users/[userId]` | `apps/web/app/(authenticated)/settings/access/users/[userId]/page.tsx` | _bespoke_ | — |
| `/settings/access/users/[userId]/edit` | `apps/web/app/(authenticated)/settings/access/users/[userId]/edit/page.tsx` | _bespoke_ | — |
| `/settings/access/users/new` | `apps/web/app/(authenticated)/settings/access/users/new/page.tsx` | _bespoke_ | — |
| `/settings/approval-matrices` | `apps/web/app/(authenticated)/settings/approval-matrices/page.tsx` | _bespoke_ | — |
| `/settings/approval-matrices/[id]` | `apps/web/app/(authenticated)/settings/approval-matrices/[id]/page.tsx` | _bespoke_ | — |
| `/settings/approval-matrices/[id]/edit` | `apps/web/app/(authenticated)/settings/approval-matrices/[id]/edit/page.tsx` | _bespoke_ | — |
| `/settings/approval-matrices/new` | `apps/web/app/(authenticated)/settings/approval-matrices/new/page.tsx` | _bespoke_ | — |
| `/settings/approvals/templates/workflow-templates` | `apps/web/app/(authenticated)/settings/approvals/templates/workflow-templates/page.tsx` | _bespoke_ | — |
| `/settings/approvals/templates/workflow-templates/[id]` | `apps/web/app/(authenticated)/settings/approvals/templates/workflow-templates/[id]/page.tsx` | _bespoke_ | — |
| `/settings/approvals/templates/workflow-templates/new` | `apps/web/app/(authenticated)/settings/approvals/templates/workflow-templates/new/page.tsx` | _bespoke_ | — |
| `/settings/apps` | `apps/web/app/(authenticated)/settings/apps/page.tsx` | _bespoke_ | — |
| `/settings/billing` | `apps/web/app/(authenticated)/settings/billing/page.tsx` | _bespoke_ | — |
| `/settings/billing/cancel` | `apps/web/app/(authenticated)/settings/billing/cancel/page.tsx` | _bespoke_ | — |
| `/settings/billing/success` | `apps/web/app/(authenticated)/settings/billing/success/page.tsx` | _bespoke_ | — |
| `/settings/branding` | `apps/web/app/(authenticated)/settings/branding/page.tsx` | _bespoke_ | — |
| `/settings/claim-types` | `apps/web/app/(authenticated)/settings/claim-types/page.tsx` | _bespoke_ | — |
| `/settings/company` | `apps/web/app/(authenticated)/settings/company/page.tsx` | _bespoke_ | — |
| `/settings/customization` | `apps/web/app/(authenticated)/settings/customization/page.tsx` | _bespoke_ | — |
| `/settings/customization/modules` | `apps/web/app/(authenticated)/settings/customization/modules/page.tsx` | _bespoke_ | — |
| `/settings/customization/packages` | `apps/web/app/(authenticated)/settings/customization/packages/page.tsx` | _bespoke_ | — |
| `/settings/customization/packages/[packageId]` | `apps/web/app/(authenticated)/settings/customization/packages/[packageId]/page.tsx` | _bespoke_ | — |
| `/settings/customization/publish` | `apps/web/app/(authenticated)/settings/customization/publish/page.tsx` | _bespoke_ | — |
| `/settings/customization/publish-center` | `apps/web/app/(authenticated)/settings/customization/publish-center/page.tsx` | _bespoke_ | — |
| `/settings/customization/sidebar` | `apps/web/app/(authenticated)/settings/customization/sidebar/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables` | `apps/web/app/(authenticated)/settings/customization/tables/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]/columns` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/columns/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]/forms` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/forms/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]/forms/[formId]/designer` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/forms/[formId]/designer/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]/views` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/views/page.tsx` | _bespoke_ | — |
| `/settings/customization/tables/[tableKey]/views/[viewId]/designer` | `apps/web/app/(authenticated)/settings/customization/tables/[tableKey]/views/[viewId]/designer/page.tsx` | _bespoke_ | — |
| `/settings/data-management` | `apps/web/app/(authenticated)/settings/data-management/page.tsx` | _bespoke_ | — |
| `/settings/desktop-agent` | `apps/web/app/(authenticated)/settings/desktop-agent/page.tsx` | _bespoke_ | — |
| `/settings/features` | `apps/web/app/(authenticated)/settings/features/page.tsx` | _bespoke_ | — |
| `/settings/holiday-calendars/manage` | `apps/web/app/(authenticated)/settings/holiday-calendars/manage/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance` | `apps/web/app/(authenticated)/settings/integrations/attendance/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/devices` | `apps/web/app/(authenticated)/settings/integrations/attendance/devices/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/devices/[id]` | `apps/web/app/(authenticated)/settings/integrations/attendance/devices/[id]/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/devices/[id]/edit` | `apps/web/app/(authenticated)/settings/integrations/attendance/devices/[id]/edit/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/devices/new` | `apps/web/app/(authenticated)/settings/integrations/attendance/devices/new/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/gateways` | `apps/web/app/(authenticated)/settings/integrations/attendance/gateways/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/gateways/[id]` | `apps/web/app/(authenticated)/settings/integrations/attendance/gateways/[id]/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/gateways/new` | `apps/web/app/(authenticated)/settings/integrations/attendance/gateways/new/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/integrations` | `apps/web/app/(authenticated)/settings/integrations/attendance/integrations/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/integrations/[id]` | `apps/web/app/(authenticated)/settings/integrations/attendance/integrations/[id]/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/integrations/new` | `apps/web/app/(authenticated)/settings/integrations/attendance/integrations/new/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/mapping` | `apps/web/app/(authenticated)/settings/integrations/attendance/mapping/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/provisioning` | `apps/web/app/(authenticated)/settings/integrations/attendance/provisioning/page.tsx` | _bespoke_ | — |
| `/settings/integrations/attendance/sync-history` | `apps/web/app/(authenticated)/settings/integrations/attendance/sync-history/page.tsx` | _bespoke_ | — |
| `/settings/leave-policies` | `apps/web/app/(authenticated)/settings/leave-policies/page.tsx` | _bespoke_ | — |
| `/settings/leave-policies/[id]` | `apps/web/app/(authenticated)/settings/leave-policies/[id]/page.tsx` | _bespoke_ | — |
| `/settings/leave-policies/[id]/edit` | `apps/web/app/(authenticated)/settings/leave-policies/[id]/edit/page.tsx` | _bespoke_ | — |
| `/settings/leave-policies/new` | `apps/web/app/(authenticated)/settings/leave-policies/new/page.tsx` | _bespoke_ | — |
| `/settings/localization` | `apps/web/app/(authenticated)/settings/localization/page.tsx` | _bespoke_ | — |
| `/settings/notifications` | `apps/web/app/(authenticated)/settings/notifications/page.tsx` | _bespoke_ | — |
| `/settings/notifications/providers` | `apps/web/app/(authenticated)/settings/notifications/providers/page.tsx` | _bespoke_ | — |
| `/settings/notifications/rules` | `apps/web/app/(authenticated)/settings/notifications/rules/page.tsx` | _bespoke_ | — |
| `/settings/notifications/templates` | `apps/web/app/(authenticated)/settings/notifications/templates/page.tsx` | _bespoke_ | — |
| `/settings/notifications/templates/[id]` | `apps/web/app/(authenticated)/settings/notifications/templates/[id]/page.tsx` | _bespoke_ | — |
| `/settings/notifications/templates/new` | `apps/web/app/(authenticated)/settings/notifications/templates/new/page.tsx` | _bespoke_ | — |
| `/settings/organization` | `apps/web/app/(authenticated)/settings/organization/page.tsx` | _bespoke_ | — |
| `/settings/overtime-policies` | `apps/web/app/(authenticated)/settings/overtime-policies/page.tsx` | _bespoke_ | — |
| `/settings/pay-components` | `apps/web/app/(authenticated)/settings/pay-components/page.tsx` | _bespoke_ | — |
| `/settings/payroll` | `apps/web/app/(authenticated)/settings/payroll/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/banks` | `apps/web/app/(authenticated)/settings/payroll/banking/banks/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/banks/[id]` | `apps/web/app/(authenticated)/settings/payroll/banking/banks/[id]/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/banks/new` | `apps/web/app/(authenticated)/settings/payroll/banking/banks/new/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/employer-bank-accounts` | `apps/web/app/(authenticated)/settings/payroll/banking/employer-bank-accounts/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/employer-bank-accounts/[id]` | `apps/web/app/(authenticated)/settings/payroll/banking/employer-bank-accounts/[id]/page.tsx` | _bespoke_ | — |
| `/settings/payroll/banking/employer-bank-accounts/new` | `apps/web/app/(authenticated)/settings/payroll/banking/employer-bank-accounts/new/page.tsx` | _bespoke_ | — |
| `/settings/payroll/configuration/pay-components` | `apps/web/app/(authenticated)/settings/payroll/configuration/pay-components/page.tsx` | _bespoke_ | — |
| `/settings/payroll/configuration/pay-components/[id]` | `apps/web/app/(authenticated)/settings/payroll/configuration/pay-components/[id]/page.tsx` | _bespoke_ | — |
| `/settings/payroll/configuration/pay-components/[id]/edit` | `apps/web/app/(authenticated)/settings/payroll/configuration/pay-components/[id]/edit/page.tsx` | _bespoke_ | — |
| `/settings/payroll/configuration/pay-components/new` | `apps/web/app/(authenticated)/settings/payroll/configuration/pay-components/new/page.tsx` | _bespoke_ | — |
| `/settings/payroll/configuration/payroll-settings` | `apps/web/app/(authenticated)/settings/payroll/configuration/payroll-settings/page.tsx` | _bespoke_ | — |
| `/settings/payroll/gl-accounts` | `apps/web/app/(authenticated)/settings/payroll/gl-accounts/page.tsx` | _bespoke_ | — |
| `/settings/payroll/payroll-settings` | `apps/web/app/(authenticated)/settings/payroll/payroll-settings/page.tsx` | _bespoke_ | — |
| `/settings/payroll/policies` | `apps/web/app/(authenticated)/settings/payroll/policies/page.tsx` | _bespoke_ | — |
| `/settings/payroll/posting-rules` | `apps/web/app/(authenticated)/settings/payroll/posting-rules/page.tsx` | _bespoke_ | — |
| `/settings/policies` | `apps/web/app/(authenticated)/settings/policies/page.tsx` | _bespoke_ | — |
| `/settings/projects` | `apps/web/app/(authenticated)/settings/projects/page.tsx` | _bespoke_ | — |
| `/settings/security` | `apps/web/app/(authenticated)/settings/security/page.tsx` | _bespoke_ | — |
| `/settings/security-access` | `apps/web/app/(authenticated)/settings/security-access/page.tsx` | _bespoke_ | — |
| `/settings/security-access/authorization/roles` | `apps/web/app/(authenticated)/settings/security-access/authorization/roles/page.tsx` | _bespoke_ | — |
| `/settings/security-access/authorization/roles/[roleId]` | `apps/web/app/(authenticated)/settings/security-access/authorization/roles/[roleId]/page.tsx` | _bespoke_ | — |
| `/settings/security-access/authorization/roles/[roleId]/edit` | `apps/web/app/(authenticated)/settings/security-access/authorization/roles/[roleId]/edit/page.tsx` | _bespoke_ | — |
| `/settings/security-access/authorization/roles/new` | `apps/web/app/(authenticated)/settings/security-access/authorization/roles/new/page.tsx` | _bespoke_ | — |
| `/settings/security-access/users` | `apps/web/app/(authenticated)/settings/security-access/users/page.tsx` | _bespoke_ | — |
| `/settings/security-access/users/[userId]` | `apps/web/app/(authenticated)/settings/security-access/users/[userId]/page.tsx` | _bespoke_ | — |
| `/settings/security-access/users/[userId]/edit` | `apps/web/app/(authenticated)/settings/security-access/users/[userId]/edit/page.tsx` | _bespoke_ | — |
| `/settings/security-access/users/new` | `apps/web/app/(authenticated)/settings/security-access/users/new/page.tsx` | _bespoke_ | — |
| `/settings/subscription` | `apps/web/app/(authenticated)/settings/subscription/page.tsx` | _bespoke_ | — |
| `/settings/subscription/billing-history` | `apps/web/app/(authenticated)/settings/subscription/billing-history/page.tsx` | _bespoke_ | — |
| `/settings/subscription/cancel` | `apps/web/app/(authenticated)/settings/subscription/cancel/page.tsx` | _bespoke_ | — |
| `/settings/subscription/overview` | `apps/web/app/(authenticated)/settings/subscription/overview/page.tsx` | _bespoke_ | — |
| `/settings/subscription/plans` | `apps/web/app/(authenticated)/settings/subscription/plans/page.tsx` | _bespoke_ | — |
| `/settings/subscription/success` | `apps/web/app/(authenticated)/settings/subscription/success/page.tsx` | _bespoke_ | — |
| `/settings/system-audit` | `apps/web/app/(authenticated)/settings/system-audit/page.tsx` | _bespoke_ | — |
| `/settings/tax-rules` | `apps/web/app/(authenticated)/settings/tax-rules/page.tsx` | _bespoke_ | — |
| `/settings/time-payroll-policies` | `apps/web/app/(authenticated)/settings/time-payroll-policies/page.tsx` | _bespoke_ | — |
| `/settings/travel-allowance-policies` | `apps/web/app/(authenticated)/settings/travel-allowance-policies/page.tsx` | _bespoke_ | — |
| `/settings/work-sites` | `apps/web/app/(authenticated)/settings/work-sites/page.tsx` | _bespoke_ | — |
| `/t/[tenantSlug]/login` | `apps/web/app/t/[tenantSlug]/login/page.tsx` | _bespoke_ | — |
| `/timesheets` | `apps/web/app/(authenticated)/timesheets/page.tsx` | `/api/timesheets` | `timesheet` |
| `/timesheets/[timesheetId]` | `apps/web/app/(authenticated)/timesheets/[timesheetId]/page.tsx` | `/api/timesheets` | `timesheet` |
| `/timesheets/[timesheetId]/edit` | `apps/web/app/(authenticated)/timesheets/[timesheetId]/edit/page.tsx` | `/api/timesheets` | `timesheet` |
| `/timesheets/approvals` | `apps/web/app/(authenticated)/timesheets/approvals/page.tsx` | `/api/timesheets` | `timesheet` |
| `/timesheets/new` | `apps/web/app/(authenticated)/timesheets/new/page.tsx` | `/api/timesheets` | `timesheet` |
| `/users` | `apps/web/app/(authenticated)/users/page.tsx` | _bespoke_ | — |
| `/users/[userId]` | `apps/web/app/(authenticated)/users/[userId]/page.tsx` | _bespoke_ | — |
| `/workspace/choose` | `apps/web/app/workspace/choose/page.tsx` | _bespoke_ | — |
| `/workspace/not-found` | `apps/web/app/workspace/not-found/page.tsx` | _bespoke_ | — |
| `/workspace/preparing` | `apps/web/app/workspace/preparing/page.tsx` | _bespoke_ | — |
| `/workspace/suspended` | `apps/web/app/workspace/suspended/page.tsx` | _bespoke_ | — |
| `/workspace/unavailable` | `apps/web/app/workspace/unavailable/page.tsx` | _bespoke_ | — |
| `/workspace/wrong-workspace` | `apps/web/app/workspace/wrong-workspace/page.tsx` | _bespoke_ | — |

## Platform admin — `apps/admin` (port 3002)

88 screens, 6 runtime-driven.

| Route | Source | API | Entity |
|---|---|---|---|
| `/` | `apps/admin/app/(internal)/page.tsx` | _bespoke_ | — |
| `/access-denied` | `apps/admin/app/access-denied/page.tsx` | _bespoke_ | — |
| `/account-settings` | `apps/admin/app/(internal)/account-settings/page.tsx` | _bespoke_ | — |
| `/agent-rollout` | `apps/admin/app/(internal)/agent-rollout/page.tsx` | _bespoke_ | — |
| `/app-releases` | `apps/admin/app/(internal)/app-releases/page.tsx` | _bespoke_ | — |
| `/billing` | `apps/admin/app/(internal)/billing/page.tsx` | _bespoke_ | — |
| `/billing/webhooks` | `apps/admin/app/(internal)/billing/webhooks/page.tsx` | _bespoke_ | — |
| `/commissions` | `apps/admin/app/(internal)/commissions/page.tsx` | _bespoke_ | — |
| `/commissions/[commissionId]` | `apps/admin/app/(internal)/commissions/[commissionId]/page.tsx` | _bespoke_ | — |
| `/contract-templates` | `apps/admin/app/(internal)/contract-templates/page.tsx` | _bespoke_ | — |
| `/contract-templates/[templateId]` | `apps/admin/app/(internal)/contract-templates/[templateId]/page.tsx` | _bespoke_ | — |
| `/contract-templates/new` | `apps/admin/app/(internal)/contract-templates/new/page.tsx` | _bespoke_ | — |
| `/contracts` | `apps/admin/app/(internal)/contracts/page.tsx` | _bespoke_ | — |
| `/contracts/[contractId]` | `apps/admin/app/(internal)/contracts/[contractId]/page.tsx` | _bespoke_ | — |
| `/contracts/new` | `apps/admin/app/(internal)/contracts/new/page.tsx` | _bespoke_ | — |
| `/customers` | `apps/admin/app/(internal)/customers/page.tsx` | `/api/customers` | `customer` |
| `/customers/[customerAccountId]` | `apps/admin/app/(internal)/customers/[customerAccountId]/page.tsx` | `/api/customers` | `customer` |
| `/customers/new` | `apps/admin/app/(internal)/customers/new/page.tsx` | `/api/customers` | `customer` |
| `/forgot-password` | `apps/admin/app/forgot-password/page.tsx` | _bespoke_ | — |
| `/invoices` | `apps/admin/app/(internal)/invoices/page.tsx` | _bespoke_ | — |
| `/invoices/[invoiceId]` | `apps/admin/app/(internal)/invoices/[invoiceId]/page.tsx` | _bespoke_ | — |
| `/leads` | `apps/admin/app/(internal)/leads/page.tsx` | _bespoke_ | — |
| `/leads/[leadId]` | `apps/admin/app/(internal)/leads/[leadId]/page.tsx` | _bespoke_ | — |
| `/leads/new` | `apps/admin/app/(internal)/leads/new/page.tsx` | _bespoke_ | — |
| `/login` | `apps/admin/app/login/page.tsx` | _bespoke_ | — |
| `/notifications` | `apps/admin/app/(internal)/notifications/page.tsx` | _bespoke_ | — |
| `/onboarding` | `apps/admin/app/(internal)/onboarding/page.tsx` | `/api/onboarding` | `employeeOnboarding` |
| `/onboarding/[onboardingId]` | `apps/admin/app/(internal)/onboarding/[onboardingId]/page.tsx` | `/api/onboarding` | `employeeOnboarding` |
| `/onboarding/new` | `apps/admin/app/(internal)/onboarding/new/page.tsx` | `/api/onboarding` | `employeeOnboarding` |
| `/operations/provisioning` | `apps/admin/app/(internal)/operations/provisioning/page.tsx` | _bespoke_ | — |
| `/partner-inquiries` | `apps/admin/app/(internal)/partner-inquiries/page.tsx` | _bespoke_ | — |
| `/partner-inquiries/[inquiryId]` | `apps/admin/app/(internal)/partner-inquiries/[inquiryId]/page.tsx` | _bespoke_ | — |
| `/partner-onboarding` | `apps/admin/app/(internal)/partner-onboarding/page.tsx` | _bespoke_ | — |
| `/partner-onboarding/[applicationId]` | `apps/admin/app/(internal)/partner-onboarding/[applicationId]/page.tsx` | _bespoke_ | — |
| `/partners` | `apps/admin/app/(internal)/partners/page.tsx` | _bespoke_ | — |
| `/partners/[partnerId]` | `apps/admin/app/(internal)/partners/[partnerId]/page.tsx` | _bespoke_ | — |
| `/partners/new` | `apps/admin/app/(internal)/partners/new/page.tsx` | _bespoke_ | — |
| `/payments` | `apps/admin/app/(internal)/payments/page.tsx` | _bespoke_ | — |
| `/payments/[paymentId]` | `apps/admin/app/(internal)/payments/[paymentId]/page.tsx` | _bespoke_ | — |
| `/plans` | `apps/admin/app/(internal)/plans/page.tsx` | _bespoke_ | — |
| `/plans/[planId]` | `apps/admin/app/(internal)/plans/[planId]/page.tsx` | _bespoke_ | — |
| `/plans/new` | `apps/admin/app/(internal)/plans/new/page.tsx` | _bespoke_ | — |
| `/preferences` | `apps/admin/app/(internal)/preferences/page.tsx` | _bespoke_ | — |
| `/profile` | `apps/admin/app/(internal)/profile/page.tsx` | _bespoke_ | — |
| `/promotions` | `apps/admin/app/(internal)/promotions/page.tsx` | _bespoke_ | — |
| `/reset-password` | `apps/admin/app/reset-password/page.tsx` | _bespoke_ | — |
| `/security` | `apps/admin/app/(internal)/security/page.tsx` | _bespoke_ | — |
| `/settings` | `apps/admin/app/(internal)/settings/page.tsx` | _bespoke_ | — |
| `/settings/appearance` | `apps/admin/app/(internal)/settings/appearance/page.tsx` | _bespoke_ | — |
| `/settings/billing` | `apps/admin/app/(internal)/settings/billing/page.tsx` | _bespoke_ | — |
| `/settings/branding` | `apps/admin/app/(internal)/settings/branding/page.tsx` | _bespoke_ | — |
| `/settings/company-profile` | `apps/admin/app/(internal)/settings/company-profile/page.tsx` | _bespoke_ | — |
| `/settings/contracts` | `apps/admin/app/(internal)/settings/contracts/page.tsx` | _bespoke_ | — |
| `/settings/customer-definitions` | `apps/admin/app/(internal)/settings/customer-definitions/page.tsx` | _bespoke_ | — |
| `/settings/customers` | `apps/admin/app/(internal)/settings/customers/page.tsx` | _bespoke_ | — |
| `/settings/demo-data` | `apps/admin/app/(internal)/settings/demo-data/page.tsx` | _bespoke_ | — |
| `/settings/desktop-agent` | `apps/admin/app/(internal)/settings/desktop-agent/page.tsx` | _bespoke_ | — |
| `/settings/email` | `apps/admin/app/(internal)/settings/email/page.tsx` | _bespoke_ | — |
| `/settings/exchange-rates` | `apps/admin/app/(internal)/settings/exchange-rates/page.tsx` | _bespoke_ | — |
| `/settings/features` | `apps/admin/app/(internal)/settings/features/page.tsx` | _bespoke_ | — |
| `/settings/integrations/stripe` | `apps/admin/app/(internal)/settings/integrations/stripe/page.tsx` | _bespoke_ | — |
| `/settings/invoices` | `apps/admin/app/(internal)/settings/invoices/page.tsx` | _bespoke_ | — |
| `/settings/lead-definitions` | `apps/admin/app/(internal)/settings/lead-definitions/page.tsx` | _bespoke_ | — |
| `/settings/legal` | `apps/admin/app/(internal)/settings/legal/page.tsx` | _bespoke_ | — |
| `/settings/monitoring` | `apps/admin/app/(internal)/settings/monitoring/page.tsx` | _bespoke_ | — |
| `/settings/monitoring/error-logs` | `apps/admin/app/(internal)/settings/monitoring/error-logs/page.tsx` | _bespoke_ | — |
| `/settings/monitoring/events` | `apps/admin/app/(internal)/settings/monitoring/events/page.tsx` | _bespoke_ | — |
| `/settings/monitoring/integrations` | `apps/admin/app/(internal)/settings/monitoring/integrations/page.tsx` | _bespoke_ | — |
| `/settings/onboarding-definitions` | `apps/admin/app/(internal)/settings/onboarding-definitions/page.tsx` | _bespoke_ | — |
| `/settings/partners` | `apps/admin/app/(internal)/settings/partners/page.tsx` | _bespoke_ | — |
| `/settings/plans` | `apps/admin/app/(internal)/settings/plans/page.tsx` | _bespoke_ | — |
| `/settings/platform-defaults` | `apps/admin/app/(internal)/settings/platform-defaults/page.tsx` | _bespoke_ | — |
| `/settings/security` | `apps/admin/app/(internal)/settings/security/page.tsx` | _bespoke_ | — |
| `/settings/support` | `apps/admin/app/(internal)/settings/support/page.tsx` | _bespoke_ | — |
| `/settings/tenant-provisioning` | `apps/admin/app/(internal)/settings/tenant-provisioning/page.tsx` | _bespoke_ | — |
| `/settings/users` | `apps/admin/app/(internal)/settings/users/page.tsx` | _bespoke_ | — |
| `/signature-requests` | `apps/admin/app/(internal)/signature-requests/page.tsx` | _bespoke_ | — |
| `/signature-requests/[requestId]` | `apps/admin/app/(internal)/signature-requests/[requestId]/page.tsx` | _bespoke_ | — |
| `/subscriptions` | `apps/admin/app/(internal)/subscriptions/page.tsx` | _bespoke_ | — |
| `/subscriptions/[subscriptionId]` | `apps/admin/app/(internal)/subscriptions/[subscriptionId]/page.tsx` | _bespoke_ | — |
| `/support/cases` | `apps/admin/app/(internal)/support/cases/page.tsx` | _bespoke_ | — |
| `/support/cases/[caseId]` | `apps/admin/app/(internal)/support/cases/[caseId]/page.tsx` | _bespoke_ | — |
| `/support/cases/new` | `apps/admin/app/(internal)/support/cases/new/page.tsx` | _bespoke_ | — |
| `/templates` | `apps/admin/app/(internal)/templates/page.tsx` | _bespoke_ | — |
| `/templates/[templateId]` | `apps/admin/app/(internal)/templates/[templateId]/page.tsx` | _bespoke_ | — |
| `/templates/new` | `apps/admin/app/(internal)/templates/new/page.tsx` | _bespoke_ | — |
| `/tenants` | `apps/admin/app/(internal)/tenants/page.tsx` | _bespoke_ | — |
| `/tenants/[tenantId]` | `apps/admin/app/(internal)/tenants/[tenantId]/page.tsx` | _bespoke_ | — |

## Landing — `apps/landing` (port 3000)

14 screens, 0 runtime-driven.

| Route | Source | API | Entity |
|---|---|---|---|
| `/` | `apps/landing/app//page.tsx` | _bespoke_ | — |
| `/about` | `apps/landing/app/about/page.tsx` | _bespoke_ | — |
| `/contact` | `apps/landing/app/contact/page.tsx` | _bespoke_ | — |
| `/features` | `apps/landing/app/features/page.tsx` | _bespoke_ | — |
| `/legal/[slug]` | `apps/landing/app/legal/[slug]/page.tsx` | _bespoke_ | — |
| `/partners` | `apps/landing/app/partners/page.tsx` | _bespoke_ | — |
| `/partners/activate/[token]` | `apps/landing/app/partners/activate/[token]/page.tsx` | _bespoke_ | — |
| `/partners/onboarding/[token]` | `apps/landing/app/partners/onboarding/[token]/page.tsx` | _bespoke_ | — |
| `/plans` | `apps/landing/app/plans/page.tsx` | _bespoke_ | — |
| `/request-demo` | `apps/landing/app/request-demo/page.tsx` | _bespoke_ | — |
| `/sign/[token]` | `apps/landing/app/sign/[token]/page.tsx` | _bespoke_ | — |
| `/subscribe` | `apps/landing/app/subscribe/page.tsx` | _bespoke_ | — |
| `/subscribe/cancel` | `apps/landing/app/subscribe/cancel/page.tsx` | _bespoke_ | — |
| `/subscribe/success` | `apps/landing/app/subscribe/success/page.tsx` | _bespoke_ | — |

## Runtime modules

Declared in `apps/web/lib/runtime/modules/standard-module-specs.ts`. These are the modules whose list and record screens are rendered by the standard runtime pages rather than written by hand.

| Module key | API path | Entity |
|---|---|---|
| `approvals` | `/api/approvals` | `approval` |
| `attendance` | `/api/attendance` | `attendanceEntry` |
| `customers` | `/api/customers` | `customer` |
| `leaves` | `/api/leave-requests` | `leaveRequest` |
| `onboarding` | `/api/onboarding` | `employeeOnboarding` |
| `projects` | `/api/projects` | `project` |
| `recruitmentApplications` | `/api/applications` | `recruitmentApplication` |
| `recruitmentCandidates` | `/api/candidates` | `candidate` |
| `recruitmentJobs` | `/api/job-openings` | `jobOpening` |
| `recruitmentTalentPool` | `/api/candidates` | `candidate` |
| `timesheets` | `/api/timesheets` | `timesheet` |
