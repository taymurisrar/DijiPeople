# TASK-0031 WP-04 — default email copy for owner review

Drafted by the Architect under ADR-0015 and shipped with the release; this is
the copy the owner reviews afterwards. It is generated from
`services/api/src/modules/notifications/system-email-templates.copy.ts`, which
is the only place the copy lives — edit that file, not this one.

`{{name}}` is replaced when the email is sent. **Status** is what the
configuration seed sets: ACTIVE only when something in the product sends the
event by email today; DRAFT copy is ready for when an emitter exists and is
never sent.

| Template | Event | Status | Sent by | Tenant can customize |
|---|---|---|---|---|
| Account activation email | `AUTH_ACCOUNT_ACTIVATION` | ACTIVE | Workspace | Yes |
| Password reset email | `AUTH_PASSWORD_RESET` | ACTIVE | Workspace | Yes |
| Verification code email | `AUTH_OTP` | DRAFT | Workspace | No |
| Invoice issued email | `BILLING_INVOICE_ISSUED` | ACTIVE | DijiPeople to customer | No |
| Payslip available email | `PAYSLIP_AVAILABLE` | ACTIVE | Workspace | Yes (needs payroll) |
| Leave approval request email | `LEAVE_APPROVAL_REQUEST` | DRAFT | Workspace | No |
| Leave approved email | `LEAVE_APPROVED` | DRAFT | Workspace | No |
| Timesheet approval request email | `TIMESHEET_APPROVAL_REQUEST` | DRAFT | Workspace | No |
| Payroll processed email | `PAYROLL_PROCESSED` | DRAFT | Workspace | No |
| Scheduled report email | `REPORT_SCHEDULE_DELIVERY` | ACTIVE | Workspace | Yes |
| Support case update email | `SUPPORT_CASE_UPDATE` | ACTIVE | DijiPeople to customer | No |

## Account activation email

- Event: `AUTH_ACCOUNT_ACTIVATION` (key `AUTH_ACCOUNT_ACTIVATION`)
- Status: ACTIVE
- When: Sent when a user is invited to the workspace.
- Variables: `recipientName` (Recipient name), `tenantName` (Company name), `appName` (Application name), `activationUrl` (Activation link), `expiresIn` (Link expiry), `supportEmail` (Support email)

**Subject**

```text
Activate your {{appName}} account for {{tenantName}}
```

**Plain-text body**

```text
Hello {{recipientName}},

An account has been created for you in {{appName}} for {{tenantName}}. Activate it to set your password and sign in:

{{activationUrl}}

This link expires in {{expiresIn}}.

If you were not expecting this invitation, you can ignore this email or contact {{supportEmail}}.
```

## Password reset email

- Event: `AUTH_PASSWORD_RESET` (key `AUTH_PASSWORD_RESET`)
- Status: ACTIVE
- When: Sent when a password reset is requested for a user.
- Variables: `recipientName` (Recipient name), `tenantName` (Company name), `appName` (Application name), `resetUrl` (Password reset link), `expiresIn` (Link expiry), `supportEmail` (Support email)

**Subject**

```text
Reset your {{appName}} password
```

**Plain-text body**

```text
Hello {{recipientName}},

We received a request to reset the password for your {{appName}} account at {{tenantName}}. Reset it here:

{{resetUrl}}

This link expires in {{expiresIn}}.

If you did not request a password reset, you can ignore this email and your password will not change. For help, contact {{supportEmail}}.
```

## Verification code email

- Event: `AUTH_OTP` (key `auth.otp`)
- Status: DRAFT
- When: One-time sign-in code. Not sent yet.
- Variables: `recipientName` (Recipient name), `tenantName` (Company name), `appName` (Application name), `otp` (Verification code), `expiresIn` (Code expiry), `supportEmail` (Support email)

**Subject**

```text
Your {{appName}} verification code
```

**Plain-text body**

```text
Hello {{recipientName}},

Use this code to finish signing in to {{appName}} for {{tenantName}}:

{{otp}}

This code expires in {{expiresIn}}. Do not share it with anyone.

If you did not try to sign in, contact {{supportEmail}}.
```

## Invoice issued email

- Event: `BILLING_INVOICE_ISSUED` (key `BILLING_INVOICE_ISSUED`)
- Status: ACTIVE
- When: Sent to a customer when a subscription invoice is issued.
- Variables: `platformName` (Billing company name), `tenantName` (Company name), `recipientName` (Recipient name), `invoiceNumber` (Invoice number), `currency` (Currency), `amountDue` (Amount due), `dueDate` (Due date), `billingPeriod` (Billing period), `paymentInstructions` (Payment instructions), `supportEmail` (Support email)

**Subject**

```text
Invoice {{invoiceNumber}} from {{platformName}}
```

**Plain-text body**

```text
Hello {{recipientName}},

A new invoice has been issued for your {{tenantName}} subscription.

Invoice number: {{invoiceNumber}}
Amount due: {{currency}} {{amountDue}}
Due date: {{dueDate}}
Billing period: {{billingPeriod}}

{{paymentInstructions}}

Questions about this invoice? Contact {{supportEmail}}.
```

## Payslip available email

- Event: `PAYSLIP_AVAILABLE` (key `PAYSLIP_AVAILABLE`)
- Status: ACTIVE
- When: Sent to an employee when their payslip is published.
- Variables: `recipientName` (Recipient name), `payrollPeriod` (Pay period), `payslipNumber` (Payslip number)

**Subject**

```text
Your payslip for {{payrollPeriod}} is available
```

**Plain-text body**

```text
Hello {{recipientName}},

Your payslip for {{payrollPeriod}} has been published.

Pay period: {{payrollPeriod}}
Payslip number: {{payslipNumber}}

Sign in and open My Payslips to view or download it.

If anything on your payslip looks incorrect, contact your HR or payroll team.
```

## Leave approval request email

- Event: `LEAVE_APPROVAL_REQUEST` (key `leave.approval-request`)
- Status: DRAFT
- When: Leave request awaiting approval. Not sent by email yet.
- Variables: `recipientName` (Recipient name), `employeeName` (Employee name), `leaveTypeName` (Leave type), `startDate` (Start date), `endDate` (End date), `actionUrl` (Request link)

**Subject**

```text
Leave request from {{employeeName}} needs your approval
```

**Plain-text body**

```text
Hello {{recipientName}},

{{employeeName}} has requested {{leaveTypeName}} from {{startDate}} to {{endDate}}.

Review the request: {{actionUrl}}
```

## Leave approved email

- Event: `LEAVE_APPROVED` (key `leave.approved`)
- Status: DRAFT
- When: Leave request approved. Not sent by email yet.
- Variables: `recipientName` (Recipient name), `leaveTypeName` (Leave type), `startDate` (Start date), `endDate` (End date), `actionUrl` (Request link)

**Subject**

```text
Your {{leaveTypeName}} request has been approved
```

**Plain-text body**

```text
Hello {{recipientName}},

Your {{leaveTypeName}} request from {{startDate}} to {{endDate}} has been approved.

View the request: {{actionUrl}}
```

## Timesheet approval request email

- Event: `TIMESHEET_APPROVAL_REQUEST` (key `timesheet.approval-request`)
- Status: DRAFT
- When: Timesheet awaiting approval. Not sent by email yet.
- Variables: `recipientName` (Recipient name), `employeeName` (Employee name), `periodLabel` (Timesheet period), `actionUrl` (Timesheet link)

**Subject**

```text
Timesheet from {{employeeName}} needs your approval
```

**Plain-text body**

```text
Hello {{recipientName}},

{{employeeName}} has submitted a timesheet for {{periodLabel}}.

Review the timesheet: {{actionUrl}}
```

## Payroll processed email

- Event: `PAYROLL_PROCESSED` (key `payroll.processed`)
- Status: DRAFT
- When: Payroll run processed. Not sent by email yet.
- Variables: `recipientName` (Recipient name), `tenantName` (Company name), `payrollPeriod` (Pay period), `actionUrl` (Payroll run link)

**Subject**

```text
Payroll for {{payrollPeriod}} has been processed
```

**Plain-text body**

```text
Hello {{recipientName}},

Payroll for {{payrollPeriod}} has been processed for {{tenantName}}.

View the payroll run: {{actionUrl}}
```

## Scheduled report email

- Event: `REPORT_SCHEDULE_DELIVERY` (key `REPORT_SCHEDULE_DELIVERY`)
- Status: ACTIVE
- When: Sent with the file attached each time a report schedule runs.
- Variables: `tenantName` (Company name), `recipientName` (Recipient name), `reportName` (Report name), `scheduleName` (Schedule name), `periodLabel` (Report period), `format` (File format), `rowCount` (Row count), `fileName` (File name)

**Subject**

```text
{{reportName}} - {{tenantName}}
```

**Plain-text body**

```text
Hello {{recipientName}},

Your scheduled report "{{reportName}}" is attached.

Schedule: {{scheduleName}}
Period: {{periodLabel}}
Format: {{format}}
Rows: {{rowCount}}
File: {{fileName}}

This report is sent on a schedule set up in {{tenantName}}. To stop receiving it, ask the person who manages the schedule to remove you.
```

## Support case update email

- Event: `SUPPORT_CASE_UPDATE` (key `SUPPORT_CASE_UPDATE`)
- Status: ACTIVE
- When: Sent to a customer when support posts an update on their case.
- Variables: `customerName` (Customer name), `caseNumber` (Case number), `caseTitle` (Case title), `updateBody` (Update text)

**Subject**

```text
Update on your support case {{caseNumber}}
```

**Plain-text body**

```text
Hello {{customerName}},

There is a new update on your support case {{caseNumber}}: {{caseTitle}}.

{{updateBody}}
```
