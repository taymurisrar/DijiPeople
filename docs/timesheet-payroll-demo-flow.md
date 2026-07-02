# Timesheet + Payroll Demo Flow

This runbook validates DijiPeople as a standalone Timesheet Records and Payroll Processing workflow for CPA firms, staffing companies, outsourcing firms, consulting firms, and multi-branch HR teams.

## Demo Assumptions

- The tenant represents the operating company or CPA firm.
- Business Units can represent branches, departments, or external organizations/accounts.
- Employees can represent internal employees or external workers.
- Payroll generation is configured to use approved timesheets.
- CPA/client portal users are not part of this scope.

## Demo Identities

For the managed demo tenant (`dijipeople-managed-demo`), all identities use
`DemoUser@12345` unless `DEMO_USER_PASSWORD` overrides it.

| Role | Login |
| --- | --- |
| Global Administrator | `ceo@dijipeople.local` |
| System Administrator | `system-admin@dijipeople.local` |
| Payroll Manager | `payroll@dijipeople.local` |
| HR | `hr@dijipeople.local` |
| Manager | `manager@dijipeople.local` |
| Employee Self Service | `employee@dijipeople.local` |

Role dashboard UAT routes are `/hr/dashboard`, `/manager/dashboard`, `/me/dashboard`, and `/executive/dashboard`. Use the corresponding HR, Manager, Employee Self Service, and CEO demo identities above. Executive payroll cost appears only when that identity is explicitly granted payroll read permission; manager and ESS dashboards never expose payroll finance aggregates.

Payroll Manager is a standalone identity and must be tested independently from
Global and System Administrator.

## Permissions Needed

- Settings: `timesheets.settings.read`, `timesheets.settings.update`, `payroll.settings.read`, `payroll.settings.update`
- Timesheets: `timesheets.read`, `timesheets.read.team` or `timesheets.read.all`, `timesheets.write`, `timesheets.submit`, `timesheets.approve`, `timesheets.reject`, `timesheets.import`, `timesheets.export`, `timesheets.template.export`
- Payroll: `payroll.read`, `payroll.write`, `payroll.run`, `payroll.review`, `payroll.finalize`, `payroll.export`

## Pages

The demo seed includes Settings Runtime records for the 2026 Fiscal Year and
payroll retention policy alongside domain-owned Payroll Period, Benefits,
Bank, Loan, Tax, and posting configuration.

- Timesheet settings: `/settings/people/attendance/attendance`
- Payroll settings: `/settings/payroll/configuration/payroll-settings`
- Business Units: `/settings/general-setup/organization/business-units`
- Payroll Periods: `/settings/payroll/cycles/payroll-periods`
- Benefit Policies: `/settings/payroll/benefits/benefit-policies`
- Loan Policies: `/settings/payroll/loans/loan-policies`
- Employees/workers: `/employees`
- Timesheets: `/timesheets`
- Timesheet approvals: `/timesheets/approvals`
- Payroll runs: `/payroll/runs`
- Payroll operations dashboard: `/payroll/dashboard`
- Payroll exception center: `/payroll/exceptions`
- Payslip delivery center: `/payroll/payslips/delivery`
- Payslips: `/payroll/payslips`
- Payroll compensation: `/payroll/compensation`

## Scenario Walkthrough

1. Configure timesheet settings in `/dashboard/settings/attendance`.
   - Confirm monthly periods, weekend days, default work hours, import/export permissions, and approval-before-payroll behavior.

2. Configure payroll settings in `/dashboard/settings/payroll`.
   - Confirm `payrollGenerationSource = approved_timesheets`.
   - Confirm `requireApprovedTimesheetsForPayroll = true` for the approval-gated demo.

3. Select or create the Business Unit that represents the operating branch, department, or external organization.
   - For CPA demos, set up one Business Unit per external organization/account.

4. Ensure workers exist under that Business Unit.
   - Internal HR demos can use normal employee records.
   - CPA demos should use employee records as external workers.

5. Open `/dashboard/timesheets`.
   - Select month/year and Business Unit.
   - Use `Export Template` to download the Excel timesheet template.

6. Fill the Excel template.
   - Keep column names unchanged.
   - Use entry types: `ON_WORK`, `ON_LEAVE`, `WEEKEND`, `HOLIDAY`.
   - Keep dates inside the selected month.

7. Import the Excel template from `/dashboard/timesheets`.
   - Upload the file.
   - Review row-level validation.
   - Confirm import only when blocking errors are zero.

8. Submit the timesheet.
   - The system checks required days, notes, manager assignment, and tenant settings.

9. Approve the timesheet from `/dashboard/timesheets/approvals`.
   - Rejection requires a reason.

10. Create a payroll cycle from `/dashboard/payroll/cycles`.
    - Select the period and Business Unit when processing a specific organization/account.

11. Open `/payroll/dashboard`, select the run, and use the guided lifecycle.
    - Review readiness preview.
    - Open `/payroll/exceptions` and resolve bank, compensation, benefit,
      attendance, leave, approval, tax, or currency blockers at their source.
    - Calculate, inspect employee and organization aggregates in Preview, and
      finalize. If a `PAYROLL_RUN` matrix exists, complete its generic Approval
      Tracker before finalizing again.
    - Lock, generate frozen payslips, and generate a provider-based bank export.
    - Mark disbursed only after a bank export exists.

12. Publish and deliver payslips from `/payroll/payslips/delivery`.
    - Regenerate only unpublished snapshots; resend failed deliveries through
      the notification orchestrator.
    - Sign in as the employee and verify list, view, and PDF download under
      `/me/payslips`.
    - Confirm the downloaded response is a non-empty PDF, uses the payslip
      number as its filename, and contains employer, employee, payroll period,
      frozen earning/deduction/tax lines, and Net Salary as finance proof.
    - Confirm ESS cannot open another employee's payslip ID or any payroll
      dashboard, run, delivery-center, or Settings route.

13. Export payroll-ready data.
    - Generate CSV, Excel, or Generic Bank Transfer output on the run detail.
    - Verify each download's filename and content type, then reconcile its row
      count and total to the frozen payroll run. Confirm an audit entry and
      `PayrollBankExport` record were written for each artifact.
    - Verify HR, Manager, and ESS receive access denied unless the explicit
      `payroll-bank-export.generate` permission is granted.

## Expected Demo Signals

- `seed:payroll-flow` idempotently creates a verified primary demo bank account,
  a salary-advance policy, and a scheduled loan installment.
- Payroll calculation freezes the installment as a `LOAN` input snapshot,
  displays the deduction on the payslip, and reduces the outstanding balance.
- Recalculating the draft run restores and re-includes the same installment
  without duplicating the deduction.
- The demo seed also creates an idempotent `LOAN_REQUEST` Approval Matrix for
  the existing `payroll-manager` role, scoped to the loan-request record type
  and seeded Loan Policy through the generic Approvals resolver. It also
  verifies every seeded payroll employee's primary bank account.
- The seeded travel Claim uses a `CLAIM_REQUEST` matrix and completed generic
  Approval Request, Step, Assignment, and Action history. Its transaction and
  approval dates are inside the demo Payroll Period cutoff.
- Demo employees receive a fixed transport allowance, an annual employee-visible
  wellness balance, and a percentage employer health contribution through
  Benefit Policies and effective Employee Benefit Assignments. Payroll freezes
  the transport and employer contribution as `BENEFIT` snapshots and payslip
  lines; the wellness perk remains ESS-visible without affecting pay.

- Import/export buttons only appear for users with the matching permissions.
- Timesheet Excel import validates rows before saving.
- Payroll generation blocks employees without approved timesheets when required by settings.
- Payroll records preserve approved timesheet summary totals.
- Payroll export includes employee, Business Unit, totals, source timesheet IDs, and payroll amounts.
- The demo seed provides `system-admin@dijipeople.local` and
  `payroll@dijipeople.local` identities in addition to Global Admin, HR,
  Manager, and ESS identities for role-parity UAT.
- `seed:payroll-flow` includes the documented ESS identity in a finalized
  payroll run and publishes its frozen payslip so list, detail, cross-employee
  denial, PDF download, and audit behavior can be browser-tested.

## Current Limitations

- Processing Cycle has a backend model but no dedicated management UI yet.
- Employee-level settings overrides are not exposed in UI yet.
- Failed import rows are shown in preview but are not downloadable as a separate file yet.
- This is payroll-ready processing output, not a full statutory tax engine.
- “Sent to provider” and “Resent to provider” confirm notification-provider
  acceptance only. Delivery receipts and recipient-inbox confirmation are not
  currently available.
- CSV, Excel, and Generic Bank Transfer are provider-neutral formats. Real
  bank-specific layouts, encryption, signing, and transmission require future
  export-provider implementations.
