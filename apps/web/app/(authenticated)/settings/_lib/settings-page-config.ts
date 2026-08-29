import type {
  SettingsFieldConfig,
  SettingsSectionConfig,
} from "@/app/components/settings";
import { PERMISSION_KEYS } from "@/lib/security-keys";

export type SettingsPageConfig = {
  key: string;
  title: string;
  description: string;
  eyebrow: string;
  sections: SettingsSectionConfig[];
  requiredAnyPermissions?: readonly string[];
};

const SETTINGS_READ = PERMISSION_KEYS.SETTINGS_READ ?? "settings.read";

export const employeeSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Employee Identifier",
    description:
      "Control how employee records are generated, initialized, and prefilled across the tenant.",
    fields: [
      {
        category: "employees",
        key: "employeeIdPrefix",
        label: "Employee ID prefix",
        type: "text",
      },
      {
        category: "employees",
        key: "employeeIdSequenceLength",
        label: "Employee ID sequence length",
        type: "number",
      },
      {
        category: "employees",
        key: "autoGenerateEmployeeId",
        label: "Auto-generate employee ID",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "defaultEmploymentType",
        label: "Default employment type",
        type: "lookup",
        lookupKey: "employmentTypes",
      },
      {
        category: "employees",
        key: "defaultWorkMode",
        label: "Default work mode",
        type: "select",
        options: [
          { label: "Office", value: "OFFICE" },
          { label: "Remote", value: "REMOTE" },
          { label: "Hybrid", value: "HYBRID" },
        ],
      },
      {
        category: "employees",
        key: "defaultEmployeeStatus",
        label: "Default employee status",
        type: "select",
        options: [
          { label: "Active", value: "ACTIVE" },
          { label: "Probation", value: "PROBATION" },
          { label: "Notice", value: "NOTICE" },
        ],
      },
    ],
  },
  {
    title: "Required Fields",
    description:
      "Define the minimum information required before an employee profile can be considered complete.",
    fields: [
      {
        category: "employees",
        key: "requirePersonalEmail",
        label: "Require personal email",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireEmergencyContact",
        label: "Require emergency contact details",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireJoiningDate",
        label: "Require joining date",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireCountry",
        label: "Require country",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireBusinessUnit",
        label: "Require business unit",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireDepartment",
        label: "Require department",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireDesignation",
        label: "Require designation",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireEmployeeLevel",
        label: "Require employee level",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireReportingManager",
        label: "Require reporting manager",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requirePrimaryWorkLocation",
        label: "Require primary work location",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireWorkCalendar",
        label: "Require work calendar",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireWorkSchedule",
        label: "Require work schedule",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Reporting Structure",
    description:
      "Keep reporting relationships practical for approvals, visibility, and escalation flow.",
    fields: [
      {
        category: "employees",
        key: "maximumReportingLevels",
        label: "Maximum reporting levels",
        type: "number",
      },
      {
        category: "employees",
        key: "maximumDirectReports",
        label: "Maximum direct reports",
        type: "number",
      },
      {
        category: "employees",
        key: "allowSkipLevelReporting",
        label: "Allow skip-level reporting",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "allowMatrixReporting",
        label: "Allow matrix reporting",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "allowEmployeeWithoutReportingManager",
        label: "Allow employee without reporting manager",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "validateReportingHierarchy",
        label: "Validate reporting hierarchy",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventCircularReporting",
        label: "Prevent circular reporting",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Duplicate Prevention",
    description:
      "Reduce duplicate employee records during manual entry, onboarding, and candidate conversion.",
    fields: [
      {
        category: "employees",
        key: "preventDuplicatePersonalEmail",
        label: "Prevent duplicate by personal email",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicateWorkEmail",
        label: "Prevent duplicate by work email",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicatePhone",
        label: "Prevent duplicate by phone",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicateNationalId",
        label: "Prevent duplicate national ID",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicatePassport",
        label: "Prevent duplicate passport",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicateEmployeeId",
        label: "Prevent duplicate employee ID",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "warnOnPossibleDuplicate",
        label: "Warn when possible duplicate is found",
        type: "checkbox",
      },
    ],
  },
];

const legacyAttendanceSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Attendance Configuration",
    description:
      "Define how check-in, check-out, modes, and location validation behave for this tenant.",
    fields: [
      {
        category: "attendance",
        key: "defaultGraceMinutes",
        label: "Late grace minutes",
        type: "number",
      },
      {
        category: "attendance",
        key: "standardWorkHoursPerDay",
        label: "Expected work hours per day",
        type: "number",
      },
      {
        category: "attendance",
        key: "allowedModes",
        label: "Allowed attendance modes",
        type: "multiselect",
        options: [
          { label: "Office", value: "OFFICE" },
          { label: "Remote", value: "REMOTE" },
          { label: "Hybrid", value: "HYBRID" },
          { label: "Field", value: "FIELD" },
          { label: "Manual", value: "MANUAL" },
          { label: "Machine", value: "MACHINE" },
        ],
      },
      {
        category: "attendance",
        key: "enforceOfficeLocationForOfficeMode",
        label: "Require office location for office mode",
        type: "checkbox",
      },
      /*
       * MANDATED, NOT CONFIGURABLE.
       *
       * The seven fields marked `disabled` below are shown for transparency and
       * cannot be changed. Device location capture is a platform integrity
       * control for every self-service mode - see the enforcement point,
       * `validateAttendanceLocationPayload` in the API's attendance service,
       * which throws unconditionally and reads none of these keys, and the
       * migration `20260728234000_attendance_mandatory_location_capture` that
       * introduced it.
       *
       * They were live, enabled controls until BUG-1979: an administrator
       * changed one, saw "Settings saved successfully", reloaded, and found the
       * old value back, with nothing in the response or the audit trail saying
       * why. The API now refuses a submitted value that differs from the
       * mandate instead of silently substituting it, and these controls no
       * longer invite the submission.
       */
      {
        category: "attendance",
        key: "requireRemoteLocationCapture",
        label: "Require remote location capture",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "locationCaptureRequired",
        label: "Require attendance location capture",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "locationRequiredForModes",
        label: "Location required for modes",
        description: "Enforced by platform policy and cannot be changed.",
        type: "multiselect",
        disabled: true,
        options: [
          { label: "Office", value: "OFFICE" },
          { label: "Remote", value: "REMOTE" },
          { label: "Hybrid", value: "HYBRID" },
        ],
      },
      {
        category: "attendance",
        key: "captureLocationOnCheckIn",
        label: "Capture location on check-in",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "captureLocationOnCheckOut",
        label: "Capture location on check-out",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "allowIpFallback",
        label: "Allow approximate IP fallback",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "allowManualLocationException",
        label: "Allow manual location exception",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "locationTimeoutSeconds",
        label: "Location timeout seconds",
        type: "number",
      },
      {
        category: "attendance",
        key: "locationRetryAttempts",
        label: "Location retry attempts",
        type: "number",
      },
      {
        category: "attendance",
        key: "highAccuracyLocation",
        label: "Use high accuracy location",
        description: "Enforced by platform policy and cannot be changed.",
        type: "checkbox",
        disabled: true,
      },
      {
        category: "attendance",
        key: "maxAllowedAccuracyMeters",
        label: "Maximum allowed accuracy meters",
        type: "number",
      },
      {
        category: "attendance",
        key: "detectMockLocation",
        label: "Detect mock location",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "rejectMockLocation",
        label: "Reject mock location",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "storeIpAddress",
        label: "Store IP address for attendance",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "storeUserAgent",
        label: "Store user agent for attendance",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "allowEarlyCheckIn",
        label: "Allow early check-in",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "earliestCheckInMinutesBeforeShift",
        label: "Earliest check-in minutes before shift",
        type: "number",
      },
      {
        category: "attendance",
        key: "allowLateCheckOut",
        label: "Allow late check-out",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "maximumWorkingHoursPerDay",
        label: "Maximum working hours per day",
        type: "number",
      },
      {
        category: "attendance",
        key: "minimumWorkingHoursPerDay",
        label: "Minimum working hours per day",
        type: "number",
      },
      {
        category: "attendance",
        key: "allowManualAdjustments",
        label: "Allow manual attendance adjustments",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Work Site / Geofence",
    description:
      "Control work-site geofence validation and outside-geofence handling.",
    fields: [
      {
        category: "attendance",
        key: "enforceWorkSiteGeofence",
        label: "Enforce work site geofence",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "maximumAllowedDistanceMeters",
        label: "Maximum allowed distance meters",
        type: "number",
      },
      {
        category: "attendance",
        key: "outsideGeofenceAction",
        label: "Outside geofence action",
        type: "select",
        options: [
          { label: "Warn", value: "WARN" },
          { label: "Block", value: "BLOCK" },
          {
            label: "Require Manager Approval",
            value: "REQUIRE_MANAGER_APPROVAL",
          },
          { label: "Allow With Reason", value: "ALLOW_WITH_REASON" },
        ],
      },
      {
        category: "attendance",
        key: "requireWorkSiteOnOfficeAttendance",
        label: "Require work site on office attendance",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Schedule Fallback",
    description:
      "Define behavior when no employee schedule is assigned and on holidays or off-days.",
    fields: [
      {
        category: "attendance",
        key: "noAssignedScheduleBehavior",
        label: "No assigned schedule behavior",
        type: "select",
        options: [
          { label: "Block Check-in", value: "BLOCK_CHECK_IN" },
          {
            label: "Use Department Schedule",
            value: "USE_DEPARTMENT_SCHEDULE",
          },
          { label: "Use Work Site Schedule", value: "USE_WORK_SITE_SCHEDULE" },
          {
            label: "Use Tenant Default Schedule",
            value: "USE_TENANT_DEFAULT_SCHEDULE",
          },
          {
            label: "Allow Manual Attendance",
            value: "ALLOW_MANUAL_ATTENDANCE",
          },
        ],
      },
      /*
       * "Allow off-day check-in" and "Allow holiday check-in" used to be here.
       *
       * Neither is a tenant-settings catalog key - they are `AttendancePolicy`
       * columns, and the settings save path rejects any key the catalog does
       * not know. So touching either control failed the entire PATCH with
       * "Unsupported setting key attendance.allowOffDayCheckIn" and discarded
       * every other unsaved change in the same submission (BUG-1978). They now
       * live on the attendance policy screen, which writes the columns that
       * actually back them.
       */
      {
        category: "attendance",
        key: "requireReasonForOffdayHolidayCheckIn",
        label: "Require reason for off-day/holiday check-in",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Attendance Corrections",
    description:
      "Control manual correction requests, approvals, and HR overrides.",
    fields: [
      {
        category: "attendance",
        key: "allowManualAttendanceAdjustments",
        label: "Allow manual attendance adjustments",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "employeesCanRequestCorrection",
        label: "Employees can request correction",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "managerCanApproveCorrection",
        label: "Manager can approve correction",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "hrCanOverrideAttendance",
        label: "HR can override attendance",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "correctionRequiresReason",
        label: "Correction requires reason",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "correctionRequiresAttachment",
        label: "Correction requires attachment",
        type: "checkbox",
      },
      {
        category: "attendance",
        key: "maximumCorrectionAgeDays",
        label: "Maximum correction age days",
        type: "number",
      },
    ],
  },
  {
    title: "Timesheet Rules",
    description:
      "Control default entry hours, submission expectations, and working-day automation. Working and off days come from Work Schedules when configured.",
    fields: [
      {
        category: "timesheets",
        key: "timesheetPeriodType",
        label: "Timesheet period type",
        type: "select",
        options: [
          { label: "Monthly", value: "monthly" },
          { label: "Weekly", value: "weekly" },
          { label: "Biweekly", value: "biweekly" },
        ],
      },
      {
        category: "timesheets",
        key: "defaultHoursForOnWork",
        label: "Default hours for On Work",
        type: "number",
      },
      {
        category: "timesheets",
        key: "requireMonthlySubmission",
        label: "Require monthly submission",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "requireAllDaysCompletedBeforeSubmit",
        label: "Require all days completed before submit",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "requireSubmissionNote",
        label: "Require submission note",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "autoFillWorkingDays",
        label: "Auto-fill weekdays as On Work",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "allowWeekendWork",
        label: "Allow weekend overrides to On Work",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "allowHolidayWork",
        label: "Allow holiday overrides to On Work",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "submissionDeadlineDaysAfterPeriodEnd",
        label: "Submission deadline days after period end",
        type: "number",
      },
      {
        category: "timesheets",
        key: "managerApprovalDeadlineDays",
        label: "Manager approval deadline days",
        type: "number",
      },
      {
        category: "timesheets",
        key: "lockTimesheetAfterApproval",
        label: "Lock timesheets after approval",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "allowFutureEntries",
        label: "Allow future entries",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "maximumBackdatedDays",
        label: "Maximum backdated days",
        type: "number",
      },
      {
        category: "timesheets",
        key: "allowRejectedTimesheetResubmission",
        label: "Allow rejected timesheet resubmission",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Timesheet Import & Payroll Handoff",
    description:
      "Control import access, export template format, and whether approved timesheets are required before payroll.",
    fields: [
      {
        category: "timesheets",
        key: "allowBulkImport",
        label: "Allow bulk timesheet import",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "allowEmployeeSelfImport",
        label: "Allow employee self import",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "allowManagerImportForTeam",
        label: "Allow manager import for team",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "requireApprovalBeforePayroll",
        label: "Require approval before payroll",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "generatePayrollInputsAutomatically",
        label: "Generate payroll inputs automatically",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "includeOvertimeInPayrollExport",
        label: "Include overtime in payroll export",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "includeLeaveInPayrollExport",
        label: "Include leave in payroll export",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "includeHolidaysInPayrollExport",
        label: "Include holidays in payroll export",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "includeUnpaidTimeInPayrollExport",
        label: "Include unpaid time in payroll export",
        type: "checkbox",
      },
      {
        category: "timesheets",
        key: "exportTemplateFormat",
        label: "Export template format",
        type: "select",
        options: [
          { label: "CSV", value: "CSV" },
          { label: "Excel", value: "XLSX" },
        ],
      },
    ],
  },
  {
    title: "Attendance Integration",
    description:
      "How DijiPeople connects to attendance devices, how often it collects attendance, and what happens to employees on those devices.",
    fields: [
      {
        category: "attendance",
        key: "integrationEnabled",
        label: "Attendance integration enabled",
        type: "checkbox",
        description:
          "Master switch. While this is off, no attendance source is polled and no provisioning is planned.",
      },
      {
        category: "attendance",
        key: "defaultSyncMode",
        label: "Default sync mode",
        type: "select",
        options: [
          { label: "Scheduled polling", value: "POLL" },
          { label: "Device push", value: "PUSH" },
          { label: "Manual only", value: "MANUAL" },
        ],
      },
      {
        category: "attendance",
        key: "defaultDevicePollIntervalMinutes",
        label: "Default poll interval (minutes)",
        type: "number",
        description:
          "Used when a new sync schedule does not specify its own interval. Five minutes is the lowest useful value.",
      },
      {
        category: "attendance",
        key: "minimumLegacyPollIntervalMinutes",
        label: "Minimum poll interval for legacy devices (minutes)",
        type: "number",
        description:
          "A floor for connectors that re-read the whole history on every poll. A connector may declare a stricter minimum; the stricter of the two applies.",
      },
      {
        category: "attendance",
        key: "deviceClockDriftWarningSeconds",
        label: "Device clock drift warning (seconds)",
        type: "number",
        description:
          "A terminal whose clock differs from DijiPeople by more than this is flagged. DijiPeople reports drift and never changes a device's clock.",
      },
      {
        category: "attendance",
        key: "deviceClockDriftCriticalSeconds",
        label: "Device clock drift critical (seconds)",
        type: "number",
        description:
          "Drift beyond this marks the device unhealthy, because punch timestamps can no longer be trusted to the minute.",
      },
      {
        category: "attendance",
        key: "gatewayHeartbeatIntervalSeconds",
        label: "Gateway heartbeat interval (seconds)",
        type: "number",
        description:
          "How often an installed gateway reports that it is alive. Applied at the gateway's next configuration refresh; no reinstall is needed.",
      },
      {
        category: "attendance",
        key: "gatewayConfigRefreshSeconds",
        label: "Gateway configuration refresh (seconds)",
        type: "number",
        description:
          "How often a gateway collects device and schedule changes made here. Shorter means changes reach the terminal sooner.",
      },
      {
        category: "attendance",
        key: "gatewayUploadBatchSize",
        label: "Gateway upload batch size",
        type: "number",
        description:
          "Punches per upload request. Smaller batches retry more cheaply after a network failure.",
      },
      {
        category: "attendance",
        key: "attendanceEngineEffectiveFrom",
        label: "Reconcile attendance from (date)",
        type: "text",
        description:
          "Attendance before this date is left exactly as it is. Set this when you start collecting attendance through DijiPeople, so existing records are not recalculated from evidence that was never captured. Leave blank to reconcile any day. Format YYYY-MM-DD.",
      },
      {
        category: "attendance",
        key: "workModeTransitionPolicy",
        label: "When a new work period starts before the last one ended",
        type: "select",
        options: [
          { label: "Record it and ask someone to review", value: "CREATE_EXCEPTION" },
          {
            label: "Refuse the new period until the previous one is closed",
            value: "REQUIRE_EXPLICIT_CHECKOUT",
          },
          { label: "Close the previous period automatically", value: "AUTO_CLOSE_PREVIOUS" },
        ],
        description:
          "Someone forgetting to check out and a reader firing twice look identical to DijiPeople but need different corrections, so the default keeps both facts and asks a person.",
      },
      {
        category: "attendance",
        key: "autoCloseMissingCheckoutAtShiftEnd",
        label: "Close a missing check-out at the scheduled shift end",
        type: "checkbox",
        description:
          "Off by default. A check-out DijiPeople invented cannot be told apart from a real one afterwards, and it is paid.",
      },
      {
        category: "attendance",
        key: "crossSiteAttendancePolicy",
        label: "Work period that starts and ends at different work sites",
        type: "select",
        options: [
          { label: "Record it and flag it", value: "WARNING" },
          { label: "Allow it without comment", value: "ALLOWED" },
          { label: "Require approval", value: "APPROVAL_REQUIRED" },
          { label: "Record it but mark it unresolved", value: "BLOCKED" },
        ],
      },
      {
        category: "attendance",
        key: "defaultPunchDirectionStrategy",
        label: "How to read devices that do not report in or out",
        type: "select",
        options: [
          { label: "Alternate in and out through the day", value: "ALTERNATING" },
          { label: "First punch in, last punch out", value: "FIRST_IN_LAST_OUT" },
          { label: "Use the device's configured direction", value: "DEVICE_DIRECTION" },
          { label: "Use the device's own in/out codes", value: "DEVICE_STATE" },
          { label: "Alternate, guided by the shift times", value: "RULE_ENGINE" },
        ],
        description:
          "Many terminals record only that a card was presented. Using the device's own codes requires a verified code table for that model; without one DijiPeople will not guess.",
      },
      {
        category: "attendance",
        key: "semanticDuplicateWindowSeconds",
        label: "Ignore repeated punches within (seconds)",
        type: "number",
        description:
          "Two punches on the same reader this close together are treated as one. Every punch is still stored; only the work periods ignore the repeat.",
      },
      {
        category: "attendance",
        key: "treatSessionGapsAsBreaks",
        label: "Treat gaps between work periods as breaks",
        type: "checkbox",
        description:
          "Off by default. A gap may be lunch, or travel between sites on work time, and only you know which.",
      },
      {
        category: "attendance",
        key: "overtimeMinimumMinutes",
        label: "Minimum extra time before overtime is proposed (minutes)",
        type: "number",
        description:
          "Time worked beyond the schedule is recorded but is not payable overtime until it is approved.",
      },
      {
        category: "attendance",
        key: "webAttendancePolicy",
        label: "Web attendance",
        type: "select",
        options: [
          { label: "Allowed", value: "ALLOWED" },
          { label: "Not allowed", value: "DISALLOWED" },
          { label: "Only as a fallback", value: "FALLBACK_ONLY" },
        ],
      },
      {
        category: "attendance",
        key: "officeWebAttendancePolicy",
        label: "Web attendance at office work sites",
        type: "select",
        options: [
          { label: "Allowed", value: "ALLOWED" },
          { label: "Not allowed", value: "DISALLOWED" },
          { label: "Only as a fallback", value: "FALLBACK_ONLY" },
        ],
        description:
          "Individual work sites can override this on the work site record.",
      },
      {
        category: "attendance",
        key: "webFallbackPolicy",
        label: "Web fallback",
        type: "select",
        options: [
          {
            label: "Allow when no device is available",
            value: "ALLOW_WHEN_DEVICE_UNAVAILABLE",
          },
          { label: "Never", value: "NEVER" },
          { label: "Always", value: "ALWAYS" },
        ],
      },
      {
        category: "attendance",
        key: "deviceProvisioningEnabled",
        label: "Device provisioning enabled",
        type: "checkbox",
        description:
          "Allows employee records to be sent to attendance devices at all.",
      },
      {
        category: "attendance",
        key: "automaticEmployeeProvisioning",
        label: "Automatic employee provisioning",
        type: "checkbox",
        description:
          "Queue employees onto devices automatically when they are activated. Only connectors validated for unattended writes are used.",
      },
      {
        category: "attendance",
        key: "automaticEmployeeDeactivation",
        label: "Automatic employee deactivation",
        type: "checkbox",
        description:
          "Disable an employee on their devices when they leave. Records are disabled rather than deleted.",
      },
      {
        category: "attendance",
        key: "provisioningMaxRetries",
        label: "Provisioning retry attempts",
        type: "number",
      },
      {
        category: "attendance",
        key: "provisioningRetryIntervalMinutes",
        label: "Provisioning retry interval (minutes)",
        type: "number",
      },
      {
        category: "attendance",
        key: "attendanceConflictPolicy",
        label: "When device and web attendance disagree",
        type: "select",
        options: [
          { label: "Prefer the device record", value: "PREFER_DEVICE" },
          { label: "Prefer the web record", value: "PREFER_WEB" },
          { label: "Prefer the earliest", value: "PREFER_EARLIEST" },
          { label: "Flag for review", value: "FLAG_FOR_REVIEW" },
        ],
      },
      {
        category: "attendance",
        key: "hybridAttendancePolicy",
        label: "Hybrid attendance",
        type: "select",
        options: [
          { label: "Derive from the day's sessions", value: "DERIVE_FROM_SESSIONS" },
          {
            label: "Require a device punch for office days",
            value: "REQUIRE_DEVICE_FOR_OFFICE",
          },
          { label: "Disabled", value: "DISABLED" },
        ],
        description:
          "Applied by the attendance engine in a later phase; configured here so the policy is set in advance.",
      },
    ],
  },
];


const payrollValidationOptions = [
  { label: "Ignore", value: "IGNORE" },
  { label: "Warn", value: "WARN" },
  { label: "Block", value: "BLOCK" },
];

export const attendanceSettingsSections: SettingsSectionConfig[] =
  legacyAttendanceSettingsSections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => field.category === "attendance"),
    }))
    .filter((section) => section.fields.length > 0);

type TabbedSettingsSection = SettingsSectionConfig & { tabKey: string };

const timesheetField = (
  key: string,
  label: string,
  type: SettingsFieldConfig["type"] = "checkbox",
  options?: SettingsFieldConfig["options"],
  lookupKey?: string,
): SettingsFieldConfig => ({
  category: "timesheets",
  key,
  label,
  type,
  options,
  lookupKey,
});

const option = (label: string, value: string) => ({ label, value });

export const timesheetSettingsSections: TabbedSettingsSection[] = [
  {
    tabKey: "general",
    title: "General",
    description:
      "Enable timesheets and define the tenant-wide entry experience.",
    fields: [
      timesheetField("enableTimesheetModule", "Enable timesheet module"),
      timesheetField("timesheetRequired", "Timesheet required"),
      timesheetField(
        "timesheetPeriodType",
        "Employee-facing period",
        "select",
        [option("Monthly with weekly sections", "monthly")],
      ),
      timesheetField("entryMode", "Entry mode", "select", [
        option("Hours", "HOURS"),
        option("Start and end time", "TIME_RANGE"),
        option("Both", "BOTH"),
      ]),
      timesheetField(
        "defaultHoursForOnWork",
        "Default working-day hours",
        "number",
      ),
      timesheetField("autoFillWorkingDays", "Auto-fill working days"),
    ],
  },
  {
    tabKey: "scope",
    title: "Scope & Applicability",
    description:
      "Manage effective scoped policies over the tenant-wide baseline.",
    fields: [],
  },
  {
    tabKey: "monthly-period",
    title: "Monthly Period",
    description:
      "Control generation and visibility of the single monthly record.",
    fields: [
      timesheetField(
        "generateNextMonthAutomatically",
        "Generate next month automatically",
      ),
      timesheetField("generationLeadDays", "Generation lead days", "number"),
      timesheetField("visiblePastMonths", "Visible past months", "number"),
      timesheetField("visibleFutureMonths", "Visible future months", "number"),
      timesheetField("allowFutureEntries", "Allow future entries"),
      timesheetField(
        "maximumBackdatedDays",
        "Maximum backdated days",
        "number",
      ),
    ],
  },
  {
    tabKey: "weekly-controls",
    title: "Weekly Controls",
    description:
      "Open, submit, approve, lock, and escalate weeks inside each month.",
    fields: [
      timesheetField("weekStartDay", "Week starts on", "select", [
        option("Monday", "MONDAY"),
        option("Tuesday", "TUESDAY"),
        option("Wednesday", "WEDNESDAY"),
        option("Thursday", "THURSDAY"),
        option("Friday", "FRIDAY"),
        option("Saturday", "SATURDAY"),
        option("Sunday", "SUNDAY"),
      ]),
      timesheetField("enableCurrentWeekOnly", "Enable current week only"),
      timesheetField(
        "allowPreviousIncompleteWeek",
        "Allow previous incomplete week",
      ),
      timesheetField("allowPreviousOverdueWeek", "Allow previous overdue week"),
      timesheetField(
        "allowPreviousRejectedWeek",
        "Allow previous rejected week",
      ),
      timesheetField("allowFutureWeekEntry", "Allow future week entry"),
      timesheetField("futureWeeksAllowed", "Future weeks allowed", "number"),
      timesheetField("weeklySubmissionRequired", "Weekly submission required"),
      timesheetField(
        "weeklySubmissionDeadlineDay",
        "Submission deadline day",
        "select",
        [
          option("Monday", "MONDAY"),
          option("Tuesday", "TUESDAY"),
          option("Wednesday", "WEDNESDAY"),
          option("Thursday", "THURSDAY"),
          option("Friday", "FRIDAY"),
          option("Saturday", "SATURDAY"),
          option("Sunday", "SUNDAY"),
        ],
      ),
      timesheetField(
        "weeklySubmissionDeadlineTime",
        "Submission deadline time",
        "text",
      ),
      timesheetField(
        "submissionGracePeriodHours",
        "Grace period hours",
        "number",
      ),
      timesheetField("allowLateSubmission", "Allow late submission"),
      timesheetField(
        "allowPayrollLateSubmissionOverride",
        "Allow payroll manager override",
      ),
      timesheetField(
        "requireLateSubmissionReason",
        "Require late-submission reason",
      ),
      timesheetField(
        "autoCompleteLeaveOnlyWeek",
        "Auto-complete leave-only week",
      ),
      timesheetField("autoSubmitLeaveOnlyWeek", "Auto-submit leave-only week"),
      timesheetField("lockWeekOnSubmission", "Lock week on submission"),
      timesheetField("lockWeekOnApproval", "Lock week on approval"),
      timesheetField(
        "allowWithdrawalBeforeApproval",
        "Allow withdrawal before approval",
      ),
    ],
  },
  {
    tabKey: "day-classification",
    title: "Day Classification",
    description:
      "Resolve expected work from schedules, shifts, employment, leave, and holidays.",
    fields: [
      timesheetField("requireWorkSchedule", "Require work schedule"),
      timesheetField(
        "missingScheduleBehavior",
        "Missing schedule behavior",
        "select",
        [
          option("Block submission", "BLOCK"),
          option("Warn", "WARN"),
          option("Use tenant hours", "TENANT_DEFAULT"),
        ],
      ),
      timesheetField("defaultWorkHours", "Fallback daily hours", "number"),
      timesheetField(
        "includeEmploymentDates",
        "Respect join and leaving dates",
      ),
      timesheetField("lockSystemClassifiedDays", "Lock system-classified days"),
    ],
  },
  {
    tabKey: "time-entry",
    title: "Time Entry",
    description:
      "Validate multiple daily entries and prevent invalid allocations.",
    fields: [
      timesheetField("minimumEntryMinutes", "Minimum entry minutes", "number"),
      timesheetField(
        "entryMinuteIncrement",
        "Entry minute increment",
        "number",
      ),
      timesheetField("maximumHoursPerDay", "Maximum hours per day", "number"),
      timesheetField(
        "preventOverlappingEntries",
        "Prevent overlapping entries",
      ),
      timesheetField("requireEntryNotes", "Require entry notes"),
      timesheetField(
        "requireNotesOverHours",
        "Require notes over hours",
        "number",
      ),
      timesheetField("allowCopyPreviousWeek", "Allow copy previous week"),
      timesheetField("allowTimerEntries", "Allow timer entries"),
    ],
  },
  {
    tabKey: "attendance-integration",
    title: "Attendance Integration",
    description:
      "Use shared attendance calculations for prefill and variance reconciliation.",
    fields: [
      timesheetField(
        "attendanceIntegrationMode",
        "Attendance integration mode",
        "select",
        [
          option("Disabled (independent)", "INDEPENDENT"),
          option("Attendance as timesheet", "ATTENDANCE_AS_TIMESHEET"),
          option("Timesheet as attendance", "TIMESHEET_AS_ATTENDANCE"),
          option("Attendance prefill", "ATTENDANCE_PREFILL"),
          option("Reconciliation only", "RECONCILIATION_ONLY"),
        ],
      ),
      timesheetField(
        "preventHoursAboveAttendance",
        "Prevent hours above attendance",
      ),
      timesheetField(
        "varianceToleranceMinutes",
        "Variance tolerance minutes",
        "number",
      ),
      timesheetField(
        "varianceTolerancePercent",
        "Variance tolerance percent",
        "number",
      ),
      timesheetField("requireVarianceReason", "Require variance reason"),
      timesheetField(
        "includeAttendanceCorrections",
        "Include approved corrections",
      ),
      timesheetField(
        "attendanceConflictBehavior",
        "Conflict behavior",
        "select",
        [
          option("Warn", "WARN"),
          option("Block", "BLOCK"),
          option("Keep timesheet", "KEEP_TIMESHEET"),
          option("Use attendance", "USE_ATTENDANCE"),
        ],
      ),
    ],
  },
  {
    tabKey: "leave-integration",
    title: "Leave Integration",
    description:
      "Show approved leave and handle partial, retroactive, and leave-only periods.",
    fields: [
      timesheetField("includeApprovedLeave", "Include approved leave"),
      timesheetField("includePartialLeave", "Include partial leave"),
      timesheetField("lockApprovedLeave", "Lock approved leave hours"),
      timesheetField(
        "recalculateRetroactiveLeave",
        "Recalculate retroactive leave",
      ),
      timesheetField(
        "pendingLeaveBehavior",
        "Pending leave behavior",
        "select",
        [option("Ignore", "IGNORE"), option("Warn", "WARN")],
      ),
    ],
  },
  {
    tabKey: "holiday-integration",
    title: "Holiday Integration",
    description:
      "Resolve scoped holiday names and control approved holiday work.",
    fields: [
      timesheetField("includeScopedHolidays", "Include scoped holidays"),
      timesheetField("allowHolidayWork", "Allow holiday work"),
      timesheetField("requireHolidayWorkReason", "Require holiday-work reason"),
      timesheetField(
        "requireHolidayWorkApproval",
        "Require holiday-work approval",
      ),
      timesheetField(
        "holidayHoursCategory",
        "Holiday hours category",
        "select",
        [option("Holiday", "HOLIDAY"), option("Overtime", "OVERTIME")],
      ),
    ],
  },
  {
    tabKey: "project-activity",
    title: "Project & Activity",
    description: "Limit selections to valid assignments and allocation dates.",
    fields: [
      timesheetField("requireProject", "Require project"),
      timesheetField("allowNonProjectTime", "Allow non-project time"),
      timesheetField(
        "allowUnassignedProjectEntry",
        "Allow unassigned projects",
      ),
      timesheetField(
        "allocationValidation",
        "Allocation validation",
        "select",
        [
          option("Warn", "WARN"),
          option("Block", "BLOCK"),
          option("Ignore", "IGNORE"),
        ],
      ),
      timesheetField(
        "requireProjectManagerApproval",
        "Require project manager approval",
      ),
      timesheetField("allowNonBillableActivity", "Allow non-billable activity"),
      timesheetField("requireTask", "Require task"),
      timesheetField("requireCostCenter", "Require cost center"),
      timesheetField("requireWorkItemReference", "Require work item reference"),
    ],
  },
  {
    tabKey: "approval-workflow",
    title: "Approval Workflow",
    description:
      "Use the shared approval matrix with optional project, HR, and payroll stages.",
    fields: [
      timesheetField("approvalScope", "Approval scope", "select", [
        option("Whole week", "WEEK"),
        option("Whole month", "MONTH"),
        option("Per project", "PROJECT"),
        option("Per entry", "ENTRY"),
      ]),
      timesheetField(
        "defaultApproverSource",
        "Default approver source",
        "select",
        [
          option("Reporting manager", "REPORTING_MANAGER"),
          option("Approval matrix", "APPROVAL_MATRIX"),
        ],
      ),
      timesheetField("requireProjectApproval", "Require project approval"),
      timesheetField("requireHrApproval", "Require HR approval"),
      timesheetField("requirePayrollApproval", "Require payroll approval"),
      timesheetField("approvalSlaHours", "Approval SLA hours", "number"),
      timesheetField("allowDelegation", "Allow delegation"),
      timesheetField("enableApprovalEscalation", "Enable escalation"),
    ],
  },
  {
    tabKey: "payroll-integration",
    title: "Payroll Integration",
    description: "Derive readiness and preserve idempotent payroll handoffs.",
    fields: [
      timesheetField("payrollUsage", "Timesheet payroll usage", "select", [
        option("Not used", "NOT_USED"),
        option("Informational", "INFORMATIONAL"),
        option("Required before calculation", "REQUIRED_CALCULATION"),
        option("Required before finalization", "REQUIRED_FINALIZATION"),
      ]),
      timesheetField("approvedTimesheetsOnly", "Approved timesheets only"),
      timesheetField("includeRegularHoursInPayroll", "Include regular hours"),
      timesheetField("includeOvertimeInPayrollExport", "Include overtime"),
      timesheetField(
        "includeUnpaidTimeInPayrollExport",
        "Include unpaid shortfall",
      ),
      timesheetField("includeWeekendHoursInPayroll", "Include weekend hours"),
      timesheetField("includeHolidaysInPayrollExport", "Include holiday hours"),
      timesheetField("includeBillableHoursInPayroll", "Include billable hours"),
      timesheetField(
        "includeNonBillableHoursInPayroll",
        "Include non-billable hours",
      ),
      timesheetField("payrollCutoffDay", "Payroll cutoff day", "number"),
      timesheetField(
        "preventReopenAfterPayroll",
        "Prevent reopening after payroll",
      ),
      timesheetField("allowPayrollAdjustment", "Allow payroll adjustment"),
    ],
  },
  {
    tabKey: "locking-reopening",
    title: "Locking & Reopening",
    description:
      "Protect approved and payroll-processed history through governed reopening.",
    fields: [
      timesheetField("lockTimesheetAfterApproval", "Lock after approval"),
      timesheetField("lockWeekAfterPayrollExport", "Lock after payroll export"),
      timesheetField("requireReopeningApproval", "Require reopening approval"),
      timesheetField(
        "allowEmployeeReopeningRequest",
        "Allow employee reopening requests",
      ),
      timesheetField(
        "allowManagerReopeningRequest",
        "Allow manager reopening requests",
      ),
      timesheetField("allowHrReopening", "Allow HR reopening"),
      timesheetField(
        "maximumReopeningPeriodDays",
        "Maximum reopening period days",
        "number",
      ),
      timesheetField(
        "allowRejectedTimesheetResubmission",
        "Allow rejected resubmission",
      ),
      timesheetField(
        "allowPayrollReopening",
        "Allow payroll administrator reopening",
      ),
      timesheetField(
        "requirePayrollAdjustmentAfterReopening",
        "Require payroll adjustment after reopening",
      ),
      timesheetField(
        "restrictReopeningToSpecifiedEntries",
        "Restrict reopening to specified entries",
      ),
      timesheetField(
        "autoExpireReopeningDays",
        "Auto-expire reopening after days",
        "number",
      ),
      timesheetField("reapprovalBehavior", "Reapproval behavior", "select", [
        option("Full workflow", "FULL_WORKFLOW"),
        option("Previous rejector", "PREVIOUS_REJECTOR"),
        option("Final approver only", "FINAL_APPROVER"),
      ]),
    ],
  },
  {
    tabKey: "warnings-restrictions",
    title: "Warnings & Access Restrictions",
    description:
      "Warn or restrict normal modules without blocking the timesheet itself.",
    fields: [
      timesheetField(
        "enableMissingTimesheetWarnings",
        "Enable missing-timesheet warnings",
      ),
      timesheetField("warningAfterDays", "Warn after days", "number"),
      timesheetField("enableAccessRestrictions", "Enable access restrictions"),
      timesheetField("restrictionMode", "Restriction mode", "select", [
        option("Warning only", "WARNING_ONLY"),
        option("Limited access", "LIMITED_ACCESS"),
        option("Timesheet only", "TIMESHEET_ONLY"),
      ]),
      timesheetField("restrictionAfterDays", "Restrict after days", "number"),
      timesheetField(
        "restrictionExpiryDays",
        "Restriction expiry days",
        "number",
      ),
      timesheetField("excludedRoleKeys", "Excluded role keys", "text"),
      timesheetField("excludedEmployeeIds", "Excluded employee IDs", "text"),
      timesheetField("restrictionAllowedModules", "Allowed modules", "text"),
      timesheetField("allowTimesheetsDuringRestriction", "Allow Timesheets"),
      timesheetField(
        "allowNotificationsDuringRestriction",
        "Allow Notifications",
      ),
      timesheetField("allowProfileDuringRestriction", "Allow Profile"),
      timesheetField("allowHelpDuringRestriction", "Allow Help and Support"),
      timesheetField("emergencyOverrideEnabled", "Emergency override"),
      timesheetField("managerRestrictionExemption", "Manager exemption"),
      timesheetField("hrRestrictionExemption", "HR exemption"),
      timesheetField(
        "temporaryOverrideExpiryHours",
        "Temporary override expiry hours",
        "number",
      ),
      timesheetField("restrictionMessage", "Restriction message", "textarea"),
      timesheetField("excludeApprovedLeave", "Exclude approved full leave"),
      timesheetField("excludePendingApproval", "Exclude pending approval"),
    ],
  },
  {
    tabKey: "notifications",
    title: "Notifications",
    description:
      "Configure submission, approval, rejection, reopening, and payroll alerts.",
    fields: [
      timesheetField("allowNotifications", "Allow notifications"),
      timesheetField("submissionReminderEnabled", "Submission reminders"),
      timesheetField("approvalReminderEnabled", "Approval reminders"),
      timesheetField("overdueNotificationEnabled", "Overdue notifications"),
      timesheetField("rejectionNotificationEnabled", "Rejection notifications"),
      timesheetField("reopeningNotificationEnabled", "Reopening notifications"),
      timesheetField(
        "payrollNotificationEnabled",
        "Payroll readiness and failure notifications",
      ),
      timesheetField("reminderSchedule", "Reminder schedule", "text"),
      timesheetField("escalationSchedule", "Escalation schedule", "text"),
    ],
  },
  {
    tabKey: "download-export",
    title: "Download & Export",
    description:
      "Configure governed current, selected, advanced, and background downloads.",
    fields: [
      timesheetField("allowBulkImport", "Allow bulk import"),
      timesheetField("allowEmployeeSelfImport", "Allow employee self import"),
      timesheetField("allowManagerImportForTeam", "Allow manager team import"),
      timesheetField(
        "exportTemplateFormat",
        "Default export format",
        "select",
        [option("Excel", "XLSX"), option("CSV", "CSV"), option("PDF", "PDF")],
      ),
      timesheetField(
        "largeExportRowThreshold",
        "Background export row threshold",
        "number",
      ),
      timesheetField("exportRetentionDays", "Export retention days", "number"),
      timesheetField(
        "sanitizeSpreadsheetValues",
        "Sanitize spreadsheet values",
      ),
    ],
  },
  {
    tabKey: "audit-compliance",
    title: "Audit & Compliance",
    description:
      "Retain immutable workflow, policy, export, integration, and job history.",
    fields: [
      timesheetField("auditEntryChanges", "Audit entry changes"),
      timesheetField("auditPolicyResolution", "Audit policy resolution"),
      timesheetField("auditExports", "Audit exports"),
      timesheetField("auditBackgroundJobs", "Audit background jobs"),
      timesheetField("retentionYears", "Retention years", "number"),
      timesheetField(
        "requireChangeReasonAfterApproval",
        "Require reason after approval",
      ),
    ],
  },
];

function payrollValidationField(
  key: string,
  label: string,
): SettingsFieldConfig {
  return {
    category: "payroll",
    key,
    label,
    type: "select",
    options: payrollValidationOptions,
  };
}

export const payrollSettingsSections: SettingsSectionConfig[] = [
  {
    title: "General",
    fields: [
      {
        category: "payroll",
        key: "payFrequency",
        label: "Pay frequency",
        type: "select",
        options: [
          { label: "Monthly", value: "MONTHLY" },
          { label: "Bi-weekly", value: "BI_WEEKLY" },
          { label: "Weekly", value: "WEEKLY" },
        ],
      },
      {
        category: "payroll",
        key: "defaultPayrollRegionId",
        label: "Default payroll region",
        type: "lookup",
        lookupKey: "payrollRegions",
      },
      {
        category: "payroll",
        key: "defaultPayrollCalendarId",
        label: "Default payroll calendar",
        type: "lookup",
        lookupKey: "payrollCalendars",
      },
      {
        category: "payroll",
        key: "defaultCurrency",
        label: "Default payroll currency",
        type: "lookup",
        lookupKey: "currencies",
      },
      {
        category: "payroll",
        key: "defaultCompensationPackageId",
        label: "Default compensation package",
        type: "lookup",
        lookupKey: "compensationPackages",
      },
      {
        category: "payroll",
        key: "defaultTaxPolicyId",
        label: "Default tax policy",
        type: "lookup",
        lookupKey: "taxPolicies",
      },
      {
        category: "payroll",
        key: "defaultPostingProfileId",
        label: "Default posting profile",
        type: "lookup",
        lookupKey: "postingProfiles",
      },
      {
        category: "payroll",
        key: "defaultPayrollCurrencySource",
        label: "Default payroll currency source",
        type: "select",
        options: [
          { label: "Tenant default", value: "TENANT_DEFAULT" },
          { label: "Payroll region", value: "PAYROLL_REGION" },
          {
            label: "Employee compensation",
            value: "EMPLOYEE_COMPENSATION",
          },
        ],
      },
      {
        category: "payroll",
        key: "allowMultiCurrencyPayroll",
        label: "Allow multi-currency payroll",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "payrollGenerationSource",
        label: "Payroll generation source",
        type: "select",
        options: [
          { label: "Attendance", value: "ATTENDANCE" },
          { label: "Timesheets", value: "TIMESHEETS" },
          { label: "Hybrid", value: "HYBRID" },
          { label: "Manual", value: "MANUAL" },
        ],
      },
      {
        category: "payroll",
        key: "payrollStatus",
        label: "Payroll status",
        type: "select",
        options: [
          { label: "Active", value: "ACTIVE" },
          { label: "Review", value: "REVIEW" },
          { label: "Paused", value: "PAUSED" },
        ],
      },
    ],
  },
  {
    title: "Validation Requirements",
    fields: [
      payrollValidationField(
        "activeEmployeeContractAction",
        "Active employee contract",
      ),
      payrollValidationField(
        "activeCompensationAssignmentAction",
        "Active compensation assignment",
      ),
      payrollValidationField("activeTaxProfileAction", "Active tax profile"),
      payrollValidationField(
        "payrollBankAccountAction",
        "Valid payroll bank account",
      ),
      payrollValidationField("approvedAttendanceAction", "Approved attendance"),
      payrollValidationField("approvedTimesheetsAction", "Approved timesheets"),
      payrollValidationField("approvedLeaveAction", "Approved leave"),
      payrollValidationField("approvedOvertimeAction", "Approved overtime"),
      payrollValidationField("projectAllocationAction", "Project allocation"),
      payrollValidationField(
        "resolvedPostingRulesAction",
        "Resolved posting rules",
      ),
      payrollValidationField(
        "validPayrollCalendarAction",
        "Valid payroll calendar",
      ),
      payrollValidationField(
        "validPayrollPeriodAction",
        "Valid payroll period",
      ),
      payrollValidationField(
        "duplicatePeriodAction",
        "Duplicate period prevention",
      ),
      payrollValidationField(
        "negativeNetPayAction",
        "Negative net pay prevention",
      ),
      payrollValidationField(
        "payrollApprovalAction",
        "Payroll approval requirement",
      ),
    ],
  },
  {
    title: "Currency & Exchange",
    fields: [
      {
        category: "payroll",
        key: "baseReportingCurrency",
        label: "Base reporting currency",
        type: "lookup",
        lookupKey: "currencies",
      },
      {
        category: "payroll",
        key: "exchangeRateSource",
        label: "Exchange rate source",
        type: "select",
        options: [
          { label: "Manual", value: "MANUAL" },
          { label: "Provider", value: "PROVIDER" },
        ],
      },
      {
        category: "payroll",
        key: "exchangeRateLockPoint",
        label: "Exchange rate lock point",
        type: "select",
        options: [
          { label: "Payroll run creation", value: "PAYROLL_RUN_CREATION" },
          { label: "Payroll approval", value: "PAYROLL_APPROVAL" },
          { label: "Payment date", value: "PAYMENT_DATE" },
        ],
      },
      {
        category: "payroll",
        key: "missingExchangeRateAction",
        label: "Missing rate action",
        type: "select",
        options: payrollValidationOptions,
      },
      {
        category: "payroll",
        key: "roundingMethod",
        label: "Rounding method",
        type: "select",
        options: [
          { label: "Half up", value: "HALF_UP" },
          { label: "Half even", value: "HALF_EVEN" },
          { label: "Up", value: "UP" },
          { label: "Down", value: "DOWN" },
        ],
      },
      {
        category: "payroll",
        key: "currencyPrecision",
        label: "Currency precision",
        type: "number",
      },
    ],
  },
  {
    title: "Payroll Calculation",
    fields: [
      {
        category: "payroll",
        key: "calculationSequenceProfile",
        label: "Calculation sequence profile",
        type: "select",
        options: [{ label: "Standard", value: "STANDARD" }],
      },
      {
        category: "payroll",
        key: "prorationMethod",
        label: "Proration method",
        type: "select",
        options: [
          { label: "Calendar days", value: "CALENDAR_DAYS" },
          { label: "Working days", value: "WORKING_DAYS" },
          { label: "Fixed days", value: "FIXED_DAYS" },
        ],
      },
      {
        category: "payroll",
        key: "partialMonthMethod",
        label: "Partial month method",
        type: "select",
        options: [
          { label: "Daily rate", value: "DAILY_RATE" },
          { label: "Working-day rate", value: "WORKING_DAY_RATE" },
        ],
      },
      {
        category: "payroll",
        key: "workingDaysSource",
        label: "Working days source",
        type: "select",
        options: [
          { label: "Payroll calendar", value: "PAYROLL_CALENDAR" },
          { label: "Employee schedule", value: "EMPLOYEE_SCHEDULE" },
          { label: "Attendance", value: "ATTENDANCE" },
        ],
      },
      {
        category: "payroll",
        key: "taxCalculationMode",
        label: "Tax calculation mode",
        type: "select",
        options: [
          { label: "Periodic", value: "PERIODIC" },
          { label: "Cumulative YTD", value: "CUMULATIVE_YTD" },
          { label: "Annualized projection", value: "ANNUALIZED_PROJECTION" },
        ],
      },
      {
        category: "payroll",
        key: "ytdRecalculationEnabled",
        label: "YTD recalculation",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "retroactiveCalculationEnabled",
        label: "Retroactive calculation",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "manualAdjustmentAllowed",
        label: "Allow manual adjustment",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "calculationPrecision",
        label: "Calculation precision",
        type: "number",
      },
      {
        category: "payroll",
        key: "roundingDifferenceComponentId",
        label: "Rounding difference component",
        type: "lookup",
        lookupKey: "payComponents",
      },
      {
        category: "payroll",
        key: "negativeNetPayHandling",
        label: "Negative net pay handling",
        type: "select",
        options: payrollValidationOptions,
      },
    ],
  },
  {
    title: "Project Allocation",
    fields: [
      {
        category: "payroll",
        key: "underAllocationAction",
        label: "Under allocation action",
        type: "select",
        options: [
          { label: "Warn", value: "WARN" },
          { label: "Block", value: "BLOCK" },
          { label: "Allocate to bench", value: "ALLOCATE_TO_BENCH" },
        ],
      },
      {
        category: "payroll",
        key: "allocationSource",
        label: "Allocation source",
        type: "select",
        options: [
          {
            label: "Employee project allocations",
            value: "EMPLOYEE_PROJECT_ALLOCATIONS",
          },
          { label: "Timesheets", value: "TIMESHEETS" },
          {
            label: "Fixed employee cost center",
            value: "EMPLOYEE_COST_CENTER",
          },
        ],
      },
      {
        category: "payroll",
        key: "projectCostPostingBehavior",
        label: "Project-cost posting behavior",
        type: "select",
        options: [
          { label: "Allocate net pay", value: "ALLOCATE_NET_PAY" },
          {
            label: "Allocate gross and employer cost",
            value: "ALLOCATE_GROSS_AND_EMPLOYER_COST",
          },
          { label: "Do not allocate", value: "NONE" },
        ],
      },
      {
        category: "payroll",
        key: "overAllocationAction",
        label: "Over allocation action",
        type: "select",
        options: [
          { label: "Warn", value: "WARN" },
          { label: "Block", value: "BLOCK" },
        ],
      },
      {
        category: "payroll",
        key: "defaultBenchCostCenterId",
        label: "Default bench cost center",
        type: "lookup",
        lookupKey: "glAccounts",
      },
    ],
  },
  {
    title: "Payment & Payslip",
    fields: [
      {
        category: "payroll",
        key: "defaultPaymentMode",
        label: "Default payment mode",
        type: "select",
        options: [
          { label: "Bank transfer", value: "BANK_TRANSFER" },
          { label: "Cash", value: "CASH" },
          { label: "Cheque", value: "CHEQUE" },
        ],
      },
      {
        category: "payroll",
        key: "defaultEmployerBankAccountId",
        label: "Default employer bank account",
        type: "lookup",
        lookupKey: "employerBankAccounts",
      },
      {
        category: "payroll",
        key: "defaultPaymentAccountId",
        label: "Default payment account",
        type: "lookup",
        lookupKey: "glAccounts",
      },
      {
        category: "payroll",
        key: "payrollExportFormat",
        label: "Payroll export format",
        type: "select",
        options: [
          { label: "CSV", value: "CSV" },
          { label: "Excel", value: "XLSX" },
        ],
      },
      {
        category: "payroll",
        key: "bankPaymentFileFormat",
        label: "Bank payment file format",
        type: "select",
        options: [
          { label: "Generic bank transfer", value: "GENERIC_BANK_TRANSFER" },
          { label: "CSV", value: "CSV" },
          { label: "Excel", value: "EXCEL" },
        ],
      },
      {
        category: "payroll",
        key: "paymentReferenceFormat",
        label: "Payment reference format",
        type: "text",
      },
      {
        category: "payroll",
        key: "payslipFormat",
        label: "Payslip format",
        type: "select",
        options: [{ label: "PDF", value: "PDF" }],
      },
      {
        category: "payroll",
        key: "payslipTemplateId",
        label: "Payslip template",
        type: "lookup",
        lookupKey: "documentTemplates",
      },
      {
        category: "payroll",
        key: "taxStatementTemplateId",
        label: "Tax statement template",
        type: "lookup",
        lookupKey: "documentTemplates",
      },
      {
        category: "payroll",
        key: "publishPayslipAfterApproval",
        label: "Publish after approval",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "payslipPasswordProtection",
        label: "Password protection",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "requireEmployeePayslipAcknowledgment",
        label: "Employee acknowledgment",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "emailPayslipOnPublish",
        label: "Email payslip on publish",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Approval",
    fields: [
      {
        category: "payroll",
        key: "requirePayrollApproval",
        label: "Require payroll approval",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "lockAfterApproval",
        label: "Lock after approval",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "allowPayrollRegeneration",
        label: "Allow payroll regeneration",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "allowPayrollReopening",
        label: "Allow payroll reopening",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "reopeningPermission",
        label: "Reopening permission",
        type: "text",
        readOnly: true,
      },
      {
        category: "payroll",
        key: "reversalRequirement",
        label: "Reversal requirement",
        type: "select",
        options: [
          { label: "Reason required", value: "REASON_REQUIRED" },
          { label: "Approval required", value: "APPROVAL_REQUIRED" },
        ],
      },
    ],
  },
  {
    title: "Finance Integration",
    fields: [
      {
        category: "payroll",
        key: "enableGlPosting",
        label: "Enable GL posting",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "defaultPostingProfileId",
        label: "Default posting profile",
        type: "lookup",
        lookupKey: "postingProfiles",
      },
      {
        category: "payroll",
        key: "postingDateSource",
        label: "Posting date source",
        type: "select",
        options: [
          { label: "Payroll period", value: "PAYROLL_PERIOD" },
          { label: "Payment date", value: "PAYMENT_DATE" },
          { label: "Approval date", value: "APPROVAL_DATE" },
        ],
      },
      {
        category: "payroll",
        key: "journalGrouping",
        label: "Journal grouping",
        type: "select",
        options: [
          { label: "Consolidated payroll", value: "CONSOLIDATED_PAYROLL" },
          { label: "Per department", value: "PER_DEPARTMENT" },
          { label: "Per employee", value: "PER_EMPLOYEE" },
        ],
      },
      {
        category: "payroll",
        key: "journalExportFormat",
        label: "Journal export format",
        type: "select",
        options: [
          { label: "CSV", value: "CSV" },
          { label: "Excel", value: "XLSX" },
        ],
      },
      {
        category: "payroll",
        key: "autoPostAfterApproval",
        label: "Auto-post after approval",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "requireBalancedJournal",
        label: "Require balanced journal",
        type: "checkbox",
      },
      {
        category: "payroll",
        key: "allowReversalPosting",
        label: "Allow reversal posting",
        type: "checkbox",
      },
    ],
  },
];

export const recruitmentSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Recruitment - Recruitment Pipeline",
    description:
      "Configure tenant-wide defaults used when jobs, candidates, and applications are created.",
    fields: [
      {
        category: "recruitment",
        key: "defaultRecruitmentPipelineId",
        label: "Default recruitment pipeline",
        description:
          "Default workflow assigned to new job openings. Job openings can still override it.",
        type: "lookup",
        lookupKey: "recruitmentPipelines",
        placeholder: "Select recruitment pipeline",
      },
      {
        category: "recruitment",
        key: "resumeParsingEnabled",
        label: "Enable resume parsing",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "automaticallyParseSkillsAndExperience",
        label: "Automatically parse skills and experience",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "duplicateCandidateDetection",
        label: "Duplicate candidate detection",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "duplicateMatchingStrategy",
        label: "Duplicate matching strategy",
        type: "select",
        options: [
          { label: "Email", value: "EMAIL" },
          { label: "Mobile Number", value: "MOBILE" },
          { label: "National ID", value: "NATIONAL_ID" },
          { label: "Passport", value: "PASSPORT" },
          { label: "Email + Mobile", value: "EMAIL_MOBILE" },
          {
            label: "Email + Mobile + National ID",
            value: "EMAIL_MOBILE_NATIONAL_ID",
          },
        ],
      },
      {
        category: "recruitment",
        key: "defaultCandidateNumberRuleId",
        label: "Default candidate number generation rule",
        type: "lookup",
        lookupKey: "numberGenerationRules",
        placeholder: "Select number generation rule",
      },
    ],
  },
  {
    title: "Recruitment - Candidate Defaults",
    description:
      "Set default candidate handling behavior without storing pipeline stages in settings.",
    fields: [
      {
        category: "recruitment",
        key: "defaultCandidateSourceId",
        label: "Default candidate source",
        type: "lookup",
        lookupKey: "candidateSources",
        placeholder: "Select candidate source",
      },
      {
        category: "recruitment",
        key: "automaticallyCreateCandidateAfterCvUpload",
        label: "Automatically create candidate after CV upload",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "automaticallyMoveRejectedCandidatesToTalentPool",
        label: "Automatically move rejected candidates to talent pool",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "candidateRetentionPolicyId",
        label: "Candidate retention policy",
        type: "lookup",
        lookupKey: "retentionPolicies",
        placeholder: "Select retention policy",
      },
    ],
  },
  {
    title: "Hiring - Employee Creation",
    description:
      "Control how hired candidates become employee drafts and active employees.",
    fields: [
      {
        category: "recruitment",
        key: "autoCreateEmployeeFromCandidate",
        label: "Automatically create employee record after hiring",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "keepEmployeeAsDraftUntilOnboardingComplete",
        label: "Keep employee as draft until onboarding completes",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "automaticallyActivateEmployeeAfterSuccessfulOnboarding",
        label: "Automatically activate employee after successful onboarding",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "preventEmployeeActivationUntilMandatoryFieldsCompleted",
        label:
          "Prevent employee activation until mandatory fields are completed",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Hiring - Assignment Defaults",
    description:
      "Configure rules used to assign recruiters, hiring managers, and interview panels.",
    fields: [
      {
        category: "recruitment",
        key: "defaultRecruiterAssignmentRuleId",
        label: "Default recruiter assignment rule",
        type: "lookup",
        lookupKey: "assignmentRules",
        placeholder: "Select assignment rule",
      },
      {
        category: "recruitment",
        key: "defaultHiringManagerAssignmentRuleId",
        label: "Default hiring manager assignment rule",
        type: "lookup",
        lookupKey: "assignmentRules",
        placeholder: "Select assignment rule",
      },
      {
        category: "recruitment",
        key: "defaultInterviewPanelRuleId",
        label: "Default interview panel rule",
        type: "lookup",
        lookupKey: "interviewPanelRules",
        placeholder: "Select interview panel rule",
      },
    ],
  },
  {
    title: "Onboarding - Defaults",
    description:
      "Set onboarding defaults that apply automatically when a candidate reaches Hired.",
    fields: [
      {
        category: "recruitment",
        key: "defaultOnboardingPlanId",
        label: "Default onboarding plan",
        type: "lookup",
        lookupKey: "onboardingPlans",
        placeholder: "Select onboarding plan",
      },
      {
        category: "recruitment",
        key: "onboardingChecklistTemplate",
        label: "Default onboarding checklist template",
        type: "lookup",
        lookupKey: "onboardingChecklistTemplates",
        placeholder: "Select checklist template",
      },
      {
        category: "recruitment",
        key: "automaticallyStartOnboardingAfterHiring",
        label: "Automatically start onboarding after hiring",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "requireMandatoryOnboardingTasksBeforeActivation",
        label: "Require completion of all mandatory tasks before activation",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Onboarding - Compliance",
    description:
      "Control approval, verification, and document gates before hire and activation.",
    fields: [
      {
        category: "recruitment",
        key: "requireOfferApprovalBeforeHiring",
        label: "Require offer approval before hiring",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "requireBackgroundVerificationBeforeHiring",
        label: "Require background verification before hiring",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "requireDocumentVerificationBeforeEmployeeActivation",
        label: "Require document verification before employee activation",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "candidateDocumentChecklistId",
        label: "Candidate document checklist",
        type: "lookup",
        lookupKey: "documentChecklists",
        placeholder: "Select document checklist",
      },
      {
        category: "recruitment",
        key: "mandatoryEmployeeDocumentChecklistId",
        label: "Mandatory employee document checklist",
        type: "lookup",
        lookupKey: "documentChecklists",
        placeholder: "Select document checklist",
      },
    ],
  },
  {
    title: "Communication & Automation - Communication",
    description:
      "Choose default templates for candidate and employee communication.",
    fields: [
      {
        category: "recruitment",
        key: "defaultCandidateEmailTemplateId",
        label: "Default candidate email template",
        type: "lookup",
        lookupKey: "emailTemplates",
        placeholder: "Select email template",
      },
      {
        category: "recruitment",
        key: "defaultOfferLetterTemplateId",
        label: "Default offer letter template",
        type: "lookup",
        lookupKey: "documentTemplates",
        placeholder: "Select document template",
      },
      {
        category: "recruitment",
        key: "defaultRejectionEmailTemplateId",
        label: "Default rejection email template",
        type: "lookup",
        lookupKey: "emailTemplates",
        placeholder: "Select email template",
      },
      {
        category: "recruitment",
        key: "defaultWelcomeEmailTemplateId",
        label: "Default welcome email template",
        type: "lookup",
        lookupKey: "emailTemplates",
        placeholder: "Select email template",
      },
    ],
  },
  {
    title: "Communication & Automation - Automation",
    description:
      "Configure automation that reduces manual handoffs during hiring and onboarding.",
    fields: [
      {
        category: "recruitment",
        key: "automaticallyCloseJobOpeningWhenPositionsFilled",
        label: "Automatically close job opening when positions are filled",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "automaticallyScheduleOnboardingTasks",
        label: "Automatically schedule onboarding tasks",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "notifyHiringManagerWhenCandidateHired",
        label: "Notify hiring manager when candidate is hired",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "notifyEmployeeWhenOnboardingStarts",
        label: "Notify employee when onboarding starts",
        type: "checkbox",
      },
    ],
  },
];

export const documentSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Upload Rules",
    description:
      "Keep file upload behavior predictable across employee, leave, recruitment, and shared document flows.",
    fields: [
      {
        category: "documents",
        key: "maxUploadSizeMb",
        label: "Maximum upload size (MB)",
        type: "number",
      },
      {
        category: "documents",
        key: "allowedExtensions",
        label: "Allowed file extensions",
        description: "Comma-separated extension list such as pdf,docx,jpg.",
        type: "text",
      },
      {
        category: "documents",
        key: "blockedExtensions",
        label: "Blocked file extensions",
        type: "text",
      },
      {
        category: "documents",
        key: "allowedMimeTypes",
        label: "Allowed MIME types",
        type: "text",
      },
      {
        category: "documents",
        key: "virusScanRequired",
        label: "Virus scan required",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "allowMultipleFilesPerRecord",
        label: "Allow multiple files per record",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "maximumFilesPerRecord",
        label: "Maximum files per record",
        type: "number",
      },
      {
        category: "documents",
        key: "requireDocumentCategories",
        label: "Require document categories",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireDescription",
        label: "Require description",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireDocumentNumber",
        label: "Require document number",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Storage",
    description:
      "Configure document storage, archival, retention, compression, and versioning.",
    fields: [
      {
        category: "documents",
        key: "storageProvider",
        label: "Storage provider",
        type: "select",
        options: [
          { label: "Internal", value: "INTERNAL" },
          { label: "Azure Blob", value: "AZURE_BLOB" },
          { label: "AWS S3", value: "AWS_S3" },
          { label: "SharePoint", value: "SHAREPOINT" },
          { label: "File System", value: "FILE_SYSTEM" },
        ],
      },
      {
        category: "documents",
        key: "archiveAfterMonths",
        label: "Archive after months",
        type: "number",
      },
      {
        category: "documents",
        key: "retentionPolicy",
        label: "Retention policy",
        type: "select",
        options: [
          { label: "Never Delete", value: "NEVER_DELETE" },
          { label: "Archive Only", value: "ARCHIVE_ONLY" },
          { label: "Delete After Years", value: "DELETE_AFTER_YEARS" },
          { label: "Legal Hold", value: "LEGAL_HOLD" },
        ],
      },
      {
        category: "documents",
        key: "deleteAfterYears",
        label: "Delete after years",
        type: "number",
      },
      {
        category: "documents",
        key: "compressionEnabled",
        label: "Compression enabled",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "versioningEnabled",
        label: "Versioning enabled",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "maximumVersions",
        label: "Maximum versions",
        type: "number",
      },
    ],
  },
  {
    title: "Security",
    description:
      "Control document encryption, download governance, and required security metadata.",
    fields: [
      {
        category: "documents",
        key: "encryptDocuments",
        label: "Encrypt documents",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "auditDownloads",
        label: "Audit downloads",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "watermarkDownloads",
        label: "Watermark downloads",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "disableExternalDownloads",
        label: "Disable external downloads",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireOwner",
        label: "Require owner",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireExpiryDate",
        label: "Require expiry date",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireEffectiveDate",
        label: "Require effective date",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "requireClassification",
        label: "Require classification",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Validation",
    description: "Configure duplicate detection and expiry validation.",
    fields: [
      {
        category: "documents",
        key: "allowDuplicateFile",
        label: "Allow duplicate file",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "duplicateDetectionStrategy",
        label: "Duplicate detection strategy",
        type: "select",
        options: [
          { label: "File Name", value: "FILE_NAME" },
          { label: "File Hash", value: "FILE_HASH" },
          { label: "File Name + Size", value: "FILE_NAME_SIZE" },
          { label: "File Hash + Record", value: "FILE_HASH_RECORD" },
        ],
      },
      {
        category: "documents",
        key: "requireExpiryForExpirableCategories",
        label: "Require expiry for expirable categories",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "blockExpiredDocuments",
        label: "Block expired documents",
        type: "checkbox",
      },
      {
        category: "documents",
        key: "warnBeforeExpiryDays",
        label: "Warn before expiry days",
        type: "number",
      },
    ],
  },
];

export const notificationSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Delivery Channels",
    description:
      "Choose which communication channels are active for tenant notifications across workflows and reminders.",
    fields: [
      {
        category: "notifications",
        key: "inAppEnabled",
        label: "Enable in-app notifications",
        description: "Show notifications inside the workspace interface.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "emailEnabled",
        label: "Enable email notifications",
        description: "Send notification emails for supported tenant events.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "browserPushEnabled",
        label: "Enable browser notifications",
        description: "Allow browser-based alerts for supported desktop users.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "digestEnabled",
        label: "Enable digest notifications",
        description:
          "Bundle selected alerts into summary notifications instead of sending them one by one.",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Approvals & Workflow Alerts",
    description:
      "Control how approval-related events are communicated across leave, onboarding, and other workflow-driven actions.",
    fields: [
      {
        category: "notifications",
        key: "approvalDigestEnabled",
        label: "Enable approval digests",
        description:
          "Send grouped summaries for pending approvals and approval activity.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "instantApprovalRequestEnabled",
        label: "Enable instant approval requests",
        description:
          "Notify approvers immediately when a new approval request is submitted.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "approvalDecisionEnabled",
        label: "Enable approval decision notifications",
        description:
          "Notify requestors when an approval is approved, rejected, or returned.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "escalationReminderEnabled",
        label: "Enable escalation reminders",
        description:
          "Send reminders when workflow items remain pending beyond the expected time.",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Employee Lifecycle Notifications",
    description:
      "Manage reminders and communication for onboarding, employee actions, and people-related operational events.",
    fields: [
      {
        category: "notifications",
        key: "onboardingReminderEnabled",
        label: "Enable onboarding reminders",
        description:
          "Send reminders for incomplete onboarding tasks and milestones.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "newJoinerAnnouncementEnabled",
        label: "Enable new joiner announcements",
        description:
          "Notify relevant users when a new employee joins the organization.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "profileCompletionReminderEnabled",
        label: "Enable profile completion reminders",
        description:
          "Remind employees to complete missing profile information and documents.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "documentExpiryReminderEnabled",
        label: "Enable document expiry reminders",
        description:
          "Notify users when employee or compliance documents are nearing expiry.",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Attendance, Leave & Timesheet Alerts",
    description:
      "Control communication for attendance events, leave requests, and timesheet compliance.",
    fields: [
      {
        category: "notifications",
        key: "timesheetReminderEnabled",
        label: "Enable timesheet reminders",
        description:
          "Remind users to complete or submit their required timesheets.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "lateCheckInAlertEnabled",
        label: "Enable late check-in alerts",
        description:
          "Notify relevant users when attendance starts late beyond configured rules.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "leaveRequestNotificationEnabled",
        label: "Enable leave request notifications",
        description:
          "Notify managers or approvers when leave requests are created.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "leaveDecisionEmailEnabled",
        label: "Enable leave decision emails",
        description:
          "Send email updates when leave requests are approved, rejected, or updated.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "attendanceRegularizationEnabled",
        label: "Enable attendance regularization notifications",
        description:
          "Notify users when attendance corrections are submitted or reviewed.",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Digest & Reminder Timing",
    description:
      "Set the cadence and behavior for digest messages and reminder-driven communication.",
    fields: [
      {
        category: "notifications",
        key: "digestFrequency",
        label: "Digest frequency",
        type: "select",
        options: [
          { label: "Daily", value: "DAILY" },
          { label: "Weekly", value: "WEEKLY" },
          { label: "Monthly", value: "MONTHLY" },
        ],
      },
      {
        category: "notifications",
        key: "defaultReminderLeadDays",
        label: "Default reminder lead days",
        description:
          "Number of days before due events when reminders should start.",
        type: "number",
      },
      {
        category: "notifications",
        key: "maxReminderAttempts",
        label: "Maximum reminder attempts",
        description:
          "Maximum number of reminder notifications sent for the same pending item.",
        type: "number",
      },
      {
        category: "notifications",
        key: "quietHoursEnabled",
        label: "Enable quiet hours",
        description:
          "Pause non-critical notifications during configured off-hours.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "quietHoursWindow",
        label: "Quiet hours window",
        description: "Quiet period range such as 10:00 PM - 7:00 AM.",
        type: "text",
      },
    ],
  },
  {
    title: "Audience & Visibility Rules",
    description:
      "Decide who receives notifications and whether communication should stay targeted or broadly visible.",
    fields: [
      {
        category: "notifications",
        key: "notifyReportingManagersOnly",
        label: "Notify reporting managers only",
        description:
          "Restrict manager-facing alerts to the assigned reporting hierarchy.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "notifyHrTeamForEmployeeChanges",
        label: "Notify HR team for employee changes",
        description:
          "Send notifications to HR when important employee changes occur.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "notifyEmployeesDirectly",
        label: "Notify employees directly",
        description:
          "Send employee-facing notifications directly instead of relying only on managers or HR.",
        type: "checkbox",
      },
      {
        category: "notifications",
        key: "showNotificationPreviewInApp",
        label: "Show in-app notification previews",
        description:
          "Display a short preview of notification content inside the workspace.",
        type: "checkbox",
      },
    ],
  },
];

export const passwordLoginSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Password Rules",
    description:
      "Define the password complexity and rotation policy for users.",
    fields: [
      {
        category: "security",
        key: "minimumPasswordLength",
        label: "Minimum password length",
        type: "number",
      },
      {
        category: "security",
        key: "requireUppercase",
        label: "Require uppercase",
        type: "checkbox",
      },
      {
        category: "security",
        key: "requireLowercase",
        label: "Require lowercase",
        type: "checkbox",
      },
      {
        category: "security",
        key: "requireNumber",
        label: "Require number",
        type: "checkbox",
      },
      {
        category: "security",
        key: "requireSpecialCharacter",
        label: "Require special character",
        type: "checkbox",
      },
      {
        category: "security",
        key: "passwordExpiryDays",
        label: "Password expiry days",
        type: "number",
      },
      {
        category: "security",
        key: "passwordHistoryCount",
        label: "Password history count",
        type: "number",
      },
    ],
  },
  {
    title: "Login Rules",
    description:
      "Control failed login handling and user verification behavior.",
    fields: [
      {
        category: "security",
        key: "failedAttemptsBeforeLock",
        label: "Failed attempts before lock",
        type: "number",
      },
      {
        category: "security",
        key: "lockDurationMinutes",
        label: "Lock duration minutes",
        type: "number",
      },
      {
        category: "security",
        key: "allowRememberMe",
        label: "Allow remember me",
        type: "checkbox",
      },
      {
        category: "security",
        key: "requireEmailVerification",
        label: "Require email verification",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Session Rules",
    description:
      "Define how long users can stay signed in and whether parallel sessions are allowed.",
    fields: [
      {
        category: "security",
        key: "allowMultipleActiveSessions",
        label: "Allow multiple active sessions",
        type: "checkbox",
      },
      {
        category: "security",
        key: "sessionTimeoutMinutes",
        label: "Session timeout minutes",
        type: "number",
      },
      {
        category: "security",
        key: "refreshTokenExpiryDays",
        label: "Refresh token expiry days",
        type: "number",
      },
      {
        category: "security",
        key: "absoluteSessionLifetimeDays",
        label: "Absolute session lifetime days",
        type: "number",
      },
      {
        category: "security",
        key: "idleTimeoutMinutes",
        label: "Idle timeout minutes",
        type: "number",
      },
    ],
  },
  {
    title: "Invitation Rules",
    description: "Configure invitation expiry and first-login password setup.",
    fields: [
      {
        category: "security",
        key: "invitationExpiryHours",
        label: "Invitation expiry hours",
        type: "number",
      },
      {
        category: "security",
        key: "allowInvitationResend",
        label: "Allow invitation resend",
        type: "checkbox",
      },
      {
        category: "security",
        key: "passwordSetupRequiredBeforeFirstLogin",
        label: "Password setup required before first login",
        type: "checkbox",
      },
    ],
  },
  {
    title: "MFA",
    description: "Configure tenant-wide multi-factor authentication behavior.",
    fields: [
      {
        category: "security",
        key: "mfaRequired",
        label: "MFA required",
        type: "checkbox",
      },
      {
        category: "security",
        key: "mfaMethod",
        label: "MFA method",
        type: "select",
        options: [
          { label: "Email", value: "EMAIL" },
          { label: "SMS", value: "SMS" },
          { label: "Authenticator App", value: "AUTHENTICATOR_APP" },
        ],
      },
      {
        category: "security",
        key: "rememberTrustedDevice",
        label: "Remember trusted device",
        type: "checkbox",
      },
    ],
  },
];

export const brandingSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Brand Identity",
    description:
      "Set the core tenant identity shown across the workspace, employee-facing screens, and shared touchpoints.",
    fields: [
      {
        category: "branding",
        key: "brandName",
        label: "Brand name",
        description: "Primary display name shown across the tenant workspace.",
        type: "text",
      },
      {
        category: "branding",
        key: "legalCompanyName",
        label: "Legal company name",
        description:
          "Formal company name used for official references and generated documents.",
        type: "text",
      },
      {
        category: "branding",
        key: "shortBrandName",
        label: "Short brand name",
        description:
          "Shortened name used where space is limited in UI components.",
        type: "text",
      },
      {
        category: "branding",
        key: "portalTagline",
        label: "Portal tagline",
        description:
          "Short supporting line shown on sign-in or workspace welcome areas.",
        type: "text",
      },
      {
        category: "branding",
        key: "brandDescription",
        label: "Brand description",
        description:
          "Short description that helps personalize employee-facing touchpoints.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Logos & Visual Assets",
    description:
      "Manage the tenant visual assets used across the app, login screen, emails, and exported documents.",
    fields: [
      {
        category: "branding",
        key: "logoUrl",
        label: "Primary logo",
        description:
          "Main logo used in the workspace header and key branded areas.",
        type: "logo-upload",
      },
      {
        category: "branding",
        key: "squareLogoUrl",
        label: "Square logo",
        description:
          "Square version of the logo for cards, compact layouts, and avatars.",
        type: "logo-upload",
      },
      {
        category: "branding",
        key: "faviconUrl",
        label: "Favicon",
        description: "Browser tab icon for the tenant workspace.",
        type: "logo-upload",
      },
      {
        category: "branding",
        key: "emailHeaderLogoUrl",
        label: "Email header logo",
        description:
          "Logo used in branded email headers and communication templates.",
        type: "logo-upload",
      },
      {
        category: "branding",
        key: "loginBannerImageUrl",
        label: "Login banner image",
        description:
          "Optional banner image shown on the sign-in or welcome screen.",
        type: "logo-upload",
      },
    ],
  },
  {
    title: "Theme Colors",
    description:
      "Control the key brand colors used across the workspace and communication surfaces.",
    fields: [
      {
        category: "branding",
        key: "primaryColor",
        label: "Primary brand color",
        description: "Main accent color used across key interactive elements.",
        type: "color",
      },
      {
        category: "branding",
        key: "secondaryColor",
        label: "Secondary brand color",
        description:
          "Supporting color used for layout balance and secondary actions.",
        type: "color",
      },
      {
        category: "branding",
        key: "accentColor",
        label: "Accent color",
        description:
          "Highlight color for badges, emphasis states, and visual cues.",
        type: "color",
      },
      {
        category: "branding",
        key: "emailBrandColor",
        label: "Email brand color",
        description:
          "Primary color used in email headers, buttons, and branded highlights.",
        type: "color",
      },
      {
        category: "branding",
        key: "appBackgroundColor",
        label: "App background color",
        description:
          "Base background color used behind dashboard and module layouts.",
        type: "color",
      },
      {
        category: "branding",
        key: "appSurfaceColor",
        label: "Surface color",
        description:
          "Surface color used on cards, sections, and content containers.",
        type: "color",
      },
      {
        category: "branding",
        key: "pageGradientStartColor",
        label: "Page gradient start",
        description: "Starting color for page-level gradient backgrounds.",
        type: "color",
      },
      {
        category: "branding",
        key: "pageGradientEndColor",
        label: "Page gradient end",
        description: "Ending color for page-level gradient backgrounds.",
        type: "color",
      },
      {
        category: "branding",
        key: "cardGradientStartColor",
        label: "Card gradient start",
        description: "Starting color for highlighted cards and hero sections.",
        type: "color",
      },
      {
        category: "branding",
        key: "cardGradientEndColor",
        label: "Card gradient end",
        description: "Ending color for highlighted cards and hero sections.",
        type: "color",
      },
    ],
  },
  {
    title: "Portal Messaging",
    description:
      "Personalize what employees and tenant users see when entering and using the workspace.",
    fields: [
      {
        category: "branding",
        key: "welcomeTitle",
        label: "Welcome title",
        description:
          "Headline shown on the sign-in page or workspace welcome area.",
        type: "text",
      },
      {
        category: "branding",
        key: "welcomeSubtitle",
        label: "Welcome subtitle",
        description: "Supporting line shown below the welcome title.",
        type: "text",
      },
      {
        category: "branding",
        key: "dashboardGreeting",
        label: "Dashboard greeting",
        description: "Default greeting message shown on landing dashboards.",
        type: "text",
      },
      {
        category: "branding",
        key: "employeePortalMessage",
        label: "Employee portal message",
        description:
          "Optional message shown to employees inside the self-service experience.",
        type: "textarea",
      },
      {
        category: "branding",
        key: "emptyStateMessage",
        label: "Empty state helper message",
        description: "Helper copy shown in empty or first-time tenant states.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Communication & Support",
    description:
      "Keep tenant communication identity and support details consistent across emails and employee touchpoints.",
    fields: [
      {
        category: "branding",
        key: "supportEmail",
        label: "Support email",
        description:
          "Primary support contact shown across the tenant workspace.",
        type: "text",
      },
      {
        category: "branding",
        key: "hrContactEmail",
        label: "HR contact email",
        description:
          "HR support contact for employees and onboarding communication.",
        type: "text",
      },
      {
        category: "branding",
        key: "replyToEmail",
        label: "Reply-to email",
        description: "Reply address used for outbound email communication.",
        type: "text",
      },
      {
        category: "branding",
        key: "supportPhone",
        label: "Support phone",
        description: "Phone number shown in support and help areas.",
        type: "text",
      },
      {
        category: "branding",
        key: "websiteUrl",
        label: "Company website URL",
        description: "Official website link shown in branded areas.",
        type: "text",
      },
      {
        category: "branding",
        key: "helpCenterUrl",
        label: "Help center URL",
        description: "Support portal or help center link for tenant users.",
        type: "text",
      },
      {
        category: "branding",
        key: "officeAddress",
        label: "Office address",
        description:
          "Address shown in support, footer, or official workspace references.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Email Branding",
    description:
      "Define how branded communication should look when the platform sends email notifications and workflow updates.",
    fields: [
      {
        category: "branding",
        key: "emailSenderName",
        label: "Email sender name",
        description:
          "Sender name used in outbound workflow and notification emails.",
        type: "text",
      },
      {
        category: "branding",
        key: "emailFooterText",
        label: "Email footer text",
        description: "Footer message shown at the bottom of branded emails.",
        type: "textarea",
      },
      {
        category: "branding",
        key: "showLogoInEmails",
        label: "Show logo in emails",
        type: "checkbox",
      },
    ],
  },
];

export const systemSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Regional & Display Preferences",
    description:
      "Keep tenant-wide regional formats and display defaults aligned for a consistent workspace experience.",
    fields: [
      {
        category: "system",
        key: "dateFormat",
        label: "Date format",
        description:
          "Default date format shown across forms, tables, and generated views.",
        type: "select",
        options: [
          { label: "MM/dd/yyyy", value: "MM/dd/yyyy" },
          { label: "dd/MM/yyyy", value: "dd/MM/yyyy" },
          { label: "yyyy-MM-dd", value: "yyyy-MM-dd" },
          { label: "dd-MMM-yyyy", value: "dd-MMM-yyyy" },
        ],
      },
      {
        category: "system",
        key: "timeFormat",
        label: "Time format",
        description:
          "Default time format used across attendance, schedules, and logs.",
        type: "select",
        options: [
          { label: "12 hour", value: "12h" },
          { label: "24 hour", value: "24h" },
        ],
      },
      {
        category: "system",
        key: "locale",
        label: "Locale",
        description:
          "Default locale for formatting, labels, and regional behavior.",
        type: "select",
        options: [
          { label: "English (United States)", value: "en-US" },
          { label: "English (United Kingdom)", value: "en-GB" },
          { label: "English (Qatar)", value: "en-QA" },
          { label: "Arabic (Qatar)", value: "ar-QA" },
          { label: "Arabic (Saudi Arabia)", value: "ar-SA" },
          { label: "English (Pakistan)", value: "en-PK" },
        ],
      },
      {
        category: "system",
        key: "uiDensity",
        label: "UI density",
        description: "Controls how compact or spacious the workspace feels.",
        type: "select",
        options: [
          { label: "Comfortable", value: "comfortable" },
          { label: "Compact", value: "compact" },
        ],
      },
      {
        category: "system",
        key: "defaultThemeMode",
        label: "Default theme mode",
        description: "Preferred visual mode for the tenant workspace.",
        type: "select",
        options: [
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
          { label: "System default", value: "system" },
        ],
      },
    ],
  },
  {
    title: "Workspace Defaults",
    description:
      "Define tenant-wide defaults for landing experience, navigation behavior, and workspace usability.",
    fields: [
      {
        category: "system",
        key: "defaultDashboardView",
        label: "Default dashboard view",
        description:
          "Default landing dashboard shown when users enter the workspace.",
        type: "lookup",
        lookupKey: "dashboardViews",
        placeholder: "Select a dashboard view",
      },
      {
        category: "system",
        key: "defaultLandingModule",
        label: "Default landing module",
        description:
          "Module where users land first if a dashboard is not configured.",
        type: "select",
        options: [
          { label: "Overview", value: "overview" },
          { label: "Employees", value: "employees" },
          { label: "Attendance", value: "attendance" },
          { label: "Leave", value: "leave" },
          { label: "Timesheets", value: "timesheets" },
          { label: "Recruitment", value: "recruitment" },
          { label: "Payroll", value: "payroll" },
        ],
      },
      {
        category: "system",
        key: "defaultWeekStartDay",
        label: "Default week start day",
        description:
          "Used for calendars, attendance summaries, and weekly planning views.",
        type: "select",
        options: [
          { label: "Sunday", value: "SUNDAY" },
          { label: "Monday", value: "MONDAY" },
          { label: "Saturday", value: "SATURDAY" },
        ],
      },
      {
        category: "system",
        key: "defaultRecordsPerPage",
        label: "Default records per page",
        description: "Default page size for data tables across the workspace.",
        type: "select",
        options: [
          { label: "10", value: "10" },
          { label: "25", value: "25" },
          { label: "50", value: "50" },
          { label: "100", value: "100" },
        ],
      },
      {
        category: "system",
        key: "enableStickyFilters",
        label: "Remember filters between visits",
        description:
          "Preserve selected filters and list preferences for returning users.",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Brand Visibility & Experience Rules",
    description:
      "Control where brand identity appears across the product and how it is presented to users.",
    fields: [
      {
        category: "branding",
        key: "showBrandingOnLoginPage",
        label: "Show branding on login page",
        type: "checkbox",
      },
      {
        category: "branding",
        key: "showBrandingInEmployeePortal",
        label: "Show branding in employee portal",
        type: "checkbox",
      },
      {
        category: "branding",
        key: "showBrandingInReports",
        label: "Show branding in reports and exports",
        type: "checkbox",
      },
      {
        category: "branding",
        key: "showCompanyNameInBrowserTitle",
        label: "Show company name in browser title",
        type: "checkbox",
      },
      {
        category: "branding",
        key: "enableWhiteLabelSupportDetails",
        label: "Enable white-label support details",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Tenant Operational Defaults",
    description:
      "Set shared defaults that influence tenant behavior across users, modules, and generated data.",
    fields: [
      {
        category: "system",
        key: "defaultTimezone",
        label: "Default timezone",
        description:
          "Timezone used for tenant scheduling, timestamps, and date-based workflows.",
        type: "lookup",
        lookupKey: "timezones",
        placeholder: "Select a timezone",
      },
      {
        category: "system",
        key: "defaultCurrency",
        label: "Default currency",
        description:
          "Primary currency used across payroll, budgets, and monetary displays.",
        type: "lookup",
        lookupKey: "currencies",
        placeholder: "Select a currency",
      },
      {
        category: "system",
        key: "defaultLanguage",
        label: "Default language",
        description:
          "Default workspace language for tenant-facing experiences.",
        type: "select",
        options: [
          { label: "English", value: "en" },
          { label: "Arabic", value: "ar" },
        ],
      },
      {
        category: "system",
        key: "autoLogoutMinutes",
        label: "Auto logout after inactivity (minutes)",
        description: "Automatically sign users out after prolonged inactivity.",
        type: "number",
      },
      {
        category: "system",
        key: "showHelpTips",
        label: "Show help tips across workspace",
        description:
          "Display helper guidance for first-time or infrequent users.",
        type: "checkbox",
      },
    ],
  },
];

export const settingsPageConfig = {
  employees: {
    key: "employees",
    title: "Employee Settings",
    description:
      "Control employee defaults, profile requirements, reporting structure, and duplicate prevention.",
    eyebrow: "People Configuration",
    sections: employeeSettingsSections,
    requiredAnyPermissions: [
      PERMISSION_KEYS.SETTINGS_READ,
      PERMISSION_KEYS.EMPLOYEES_READ,
    ],
  },
  attendance: {
    key: "attendance",
    title: "Attendance Settings",
    description:
      "Configure attendance rules, device behavior, work schedules, corrections, and check-in controls.",
    eyebrow: "People Configuration",
    sections: attendanceSettingsSections,
    requiredAnyPermissions: [
      PERMISSION_KEYS.SETTINGS_READ,
      PERMISSION_KEYS.ATTENDANCE_READ,
      PERMISSION_KEYS.TIMESHEETS_SETTINGS_READ,
    ],
  },
  timesheets: {
    key: "timesheets",
    title: "Timesheet Settings",
    description:
      "Configure scoped monthly timesheets, weekly workflows, integrations, payroll readiness, and governed exports.",
    eyebrow: "People Configuration",
    sections: timesheetSettingsSections,
    requiredAnyPermissions: [
      PERMISSION_KEYS.SETTINGS_READ,
      PERMISSION_KEYS.TIMESHEETS_SETTINGS_READ,
    ],
  },
  payroll: {
    key: "payroll",
    title: "Payroll Settings",
    description:
      "Define payroll defaults, compensation rules, generation logic, and payroll behavior.",
    eyebrow: "Payroll & Finance",
    sections: payrollSettingsSections,
    requiredAnyPermissions: [SETTINGS_READ, "payroll.settings.read"],
  },
  recruitment: {
    key: "recruitment",
    title: "Recruitment & Onboarding",
    description:
      "Configure hiring pipeline, onboarding workflow, and candidate-to-employee conversion.",
    eyebrow: "Apps & Modules",
    sections: recruitmentSettingsSections,
    requiredAnyPermissions: [
      SETTINGS_READ,
      "recruitment.read",
      "onboarding.read",
    ],
  },
  documents: {
    key: "documents",
    title: "Document Rules",
    description:
      "Define storage rules, validation, and governance for documents across modules.",
    eyebrow: "People Configuration",
    sections: documentSettingsSections,
    requiredAnyPermissions: [SETTINGS_READ, "documents.read"],
  },
  notifications: {
    key: "notifications",
    title: "Notifications",
    description:
      "Control communication channels, alerts, digests, reminders, and notification behavior.",
    eyebrow: "People Configuration",
    sections: notificationSettingsSections,
    requiredAnyPermissions: [SETTINGS_READ],
  },
  branding: {
    key: "branding",
    title: "Branding",
    description:
      "Manage brand identity, visual assets, colors, messaging, support details, and email branding.",
    eyebrow: "Appearance & Experience",
    sections: brandingSettingsSections,
    requiredAnyPermissions: [SETTINGS_READ],
  },
  system: {
    key: "system",
    title: "System Preferences",
    description:
      "Configure regional settings, display preferences, workspace defaults, and tenant-wide operational behavior.",
    eyebrow: "Appearance & Experience",
    sections: systemSettingsSections,
    requiredAnyPermissions: [SETTINGS_READ],
  },
} satisfies Record<string, SettingsPageConfig>;

export type SettingsPageKey = keyof typeof settingsPageConfig;

export function getSettingsPageConfig(key: string) {
  return settingsPageConfig[key as SettingsPageKey] ?? null;
}

export function getAllSettingsPageConfigs() {
  return Object.values(settingsPageConfig);
}

export function getSettingsPageSections(key: string) {
  return getSettingsPageConfig(key)?.sections ?? [];
}
