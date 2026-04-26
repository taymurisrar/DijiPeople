# Timesheet + Payroll Demo Flow

This runbook validates DijiPeople as a standalone Timesheet Records and Payroll Processing workflow for CPA firms, staffing companies, outsourcing firms, consulting firms, and multi-branch HR teams.

## Demo Assumptions

- The tenant represents the operating company or CPA firm.
- Business Units can represent branches, departments, or external organizations/accounts.
- Employees can represent internal employees or external workers.
- Payroll generation is configured to use approved timesheets.
- CPA/client portal users are not part of this scope.

## Permissions Needed

- Settings: `timesheets.settings.read`, `timesheets.settings.update`, `payroll.settings.read`, `payroll.settings.update`
- Timesheets: `timesheets.read`, `timesheets.read.team` or `timesheets.read.all`, `timesheets.write`, `timesheets.submit`, `timesheets.approve`, `timesheets.reject`, `timesheets.import`, `timesheets.export`, `timesheets.template.export`
- Payroll: `payroll.read`, `payroll.write`, `payroll.run`, `payroll.review`, `payroll.finalize`, `payroll.export`

## Pages

- Timesheet settings: `/dashboard/settings/attendance`
- Payroll settings: `/dashboard/settings/payroll`
- Business Units: `/dashboard/settings/business-units`
- Employees/workers: `/dashboard/employees`
- Timesheets: `/dashboard/timesheets`
- Timesheet approvals: `/dashboard/timesheets/approvals`
- Payroll cycles: `/dashboard/payroll/cycles`
- Payroll compensation: `/dashboard/payroll/compensation`

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

11. Open the payroll cycle detail page.
    - Review readiness preview.
    - Resolve missing compensation or missing approved timesheets.
    - Generate draft payroll.
    - Mark reviewed.
    - Finalize payroll.

12. Export payroll-ready data.
    - Use `Export payroll` on the payroll cycle detail page.

## Expected Demo Signals

- Import/export buttons only appear for users with the matching permissions.
- Timesheet Excel import validates rows before saving.
- Payroll generation blocks employees without approved timesheets when required by settings.
- Payroll records preserve approved timesheet summary totals.
- Payroll export includes employee, Business Unit, totals, source timesheet IDs, and payroll amounts.

## Current Limitations

- Processing Cycle has a backend model but no dedicated management UI yet.
- Employee-level settings overrides are not exposed in UI yet.
- Failed import rows are shown in preview but are not downloadable as a separate file yet.
- This is payroll-ready processing output, not a full statutory tax engine.
