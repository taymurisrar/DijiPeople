import type { SettingsSectionConfig } from "@/app/components/settings";

export const employeeSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Employee Profile Defaults",
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
        type: "select",
        options: [
          { label: "Full time", value: "FULL_TIME" },
          { label: "Part time", value: "PART_TIME" },
          { label: "Contract", value: "CONTRACT" },
          { label: "Intern", value: "INTERN" },
          { label: "Consultant", value: "CONSULTANT" },
        ],
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
    title: "Required Profile Rules",
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
        key: "requireReportingManager",
        label: "Require reporting manager",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "requireWorkLocation",
        label: "Require work location",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Reporting Structure Rules",
    description:
      "Keep reporting relationships practical for approvals, visibility, and escalation flow.",
    fields: [
      {
        category: "employees",
        key: "maxReportingLevels",
        label: "Maximum reporting levels",
        type: "number",
      },
      {
        category: "employees",
        key: "allowSkipLevelApprovals",
        label: "Allow skip-level approvals",
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
        key: "allowEmployeeWithoutManager",
        label: "Allow employee without reporting manager",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Duplicate Prevention Rules",
    description:
      "Reduce duplicate employee records during manual entry, onboarding, and candidate conversion.",
    fields: [
      {
        category: "employees",
        key: "preventDuplicateByPersonalEmail",
        label: "Prevent duplicate by personal email",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicateByPhoneNumber",
        label: "Prevent duplicate by phone number",
        type: "checkbox",
      },
      {
        category: "employees",
        key: "preventDuplicateByNationalId",
        label: "Prevent duplicate by national ID / passport",
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

export const attendanceSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Attendance Rules",
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
      {
        category: "attendance",
        key: "requireRemoteLocationCapture",
        label: "Require remote location capture",
        type: "checkbox",
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
    title: "Timesheet Rules",
    description:
      "Control weekend behavior, default entry hours, submission expectations, and working-day automation.",
    fields: [
      {
        category: "timesheets",
        key: "weekendDays",
        label: "Weekend days",
        type: "multiselect",
        options: [
          { label: "Sunday", value: "SUNDAY" },
          { label: "Monday", value: "MONDAY" },
          { label: "Tuesday", value: "TUESDAY" },
          { label: "Wednesday", value: "WEDNESDAY" },
          { label: "Thursday", value: "THURSDAY" },
          { label: "Friday", value: "FRIDAY" },
          { label: "Saturday", value: "SATURDAY" },
        ],
      },
      {
        category: "timesheets",
        key: "defaultWorkHours",
        label: "Default timesheet entry hours",
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
    ],
  },
];

export const payrollSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Payroll Defaults",
    description:
      "Capture the most important payroll configuration choices without overcomplicating setup.",
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
        key: "payrollStatus",
        label: "Payroll status",
        type: "select",
        options: [
          { label: "Active", value: "ACTIVE" },
          { label: "Review", value: "REVIEW" },
          { label: "Paused", value: "PAUSED" },
        ],
      },
      {
        category: "payroll",
        key: "defaultPayrollGroup",
        label: "Default payroll group",
        type: "text",
      },
      {
        category: "payroll",
        key: "defaultPaymentMode",
        label: "Default payment mode",
        type: "select",
        options: [
          { label: "Bank transfer", value: "BANK_TRANSFER" },
          { label: "Cheque", value: "CHEQUE" },
          { label: "Cash", value: "CASH" },
        ],
      },
      {
        category: "payroll",
        key: "compensationReviewCycle",
        label: "Compensation review cycle",
        type: "select",
        options: [
          { label: "Annual", value: "ANNUAL" },
          { label: "Semi-annual", value: "SEMI_ANNUAL" },
          { label: "Quarterly", value: "QUARTERLY" },
        ],
      },
    ],
  },
];

export const recruitmentSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Recruitment Pipeline",
    description:
      "Shape the hiring pipeline and candidate progression rules across the tenant.",
    fields: [
      {
        category: "recruitment",
        key: "candidateStages",
        label: "Candidate stages",
        description: "Comma-separated stage order for the tenant pipeline.",
        type: "textarea",
      },
      {
        category: "recruitment",
        key: "resumeParsingEnabled",
        label: "Enable resume parsing",
        type: "checkbox",
      },
    ],
  },
  {
    title: "Hiring Conversion & Onboarding",
    description:
      "Control how hired candidates convert into employee drafts and what must happen before activation.",
    fields: [
      {
        category: "recruitment",
        key: "autoCreateEmployeeFromCandidate",
        label: "Auto-create employee draft when candidate is hired",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "onboardingWorkflow",
        label: "Default onboarding workflow",
        type: "text",
      },
      {
        category: "employees",
        key: "onboardingChecklistTemplate",
        label: "Default onboarding checklist template",
        type: "lookup",
        lookupKey: "onboardingChecklistTemplates",
        placeholder: "Select checklist template",
      },
      {
        category: "recruitment",
        key: "keepEmployeeAsDraftUntilOnboardingComplete",
        label: "Keep employee as draft until onboarding is complete",
        type: "checkbox",
      },
      {
        category: "recruitment",
        key: "preventEmployeeActivationUntilMandatoryFieldsCompleted",
        label: "Prevent activation until mandatory fields are completed",
        type: "checkbox",
      },
    ],
  },
];

export const documentSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Storage & Validation Rules",
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
        key: "archiveAfterMonths",
        label: "Archive after months",
        type: "number",
      },
      {
        category: "documents",
        key: "requireDocumentCategories",
        label: "Require document categories",
        type: "checkbox",
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
        description:
          "Main accent color used across key interactive elements.",
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
        description:
          "Starting color for page-level gradient backgrounds.",
        type: "color",
      },
      {
        category: "branding",
        key: "pageGradientEndColor",
        label: "Page gradient end",
        description:
          "Ending color for page-level gradient backgrounds.",
        type: "color",
      },
      {
        category: "branding",
        key: "cardGradientStartColor",
        label: "Card gradient start",
        description:
          "Starting color for highlighted cards and hero sections.",
        type: "color",
      },
      {
        category: "branding",
        key: "cardGradientEndColor",
        label: "Card gradient end",
        description:
          "Ending color for highlighted cards and hero sections.",
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
        description:
          "Support portal or help center link for tenant users.",
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
        description:
          "Default page size for data tables across the workspace.",
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
        description:
          "Automatically sign users out after prolonged inactivity.",
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
