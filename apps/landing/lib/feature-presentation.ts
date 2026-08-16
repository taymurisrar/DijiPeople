/**
 * Marketing presentation for the feature catalogue.
 *
 * **This file holds no commercial truth.** Which features exist, which category
 * each belongs to, and which plan includes which — all of that comes from the
 * backend's published commercial configuration, sourced from the same
 * `TENANT_FEATURE_DEFINITIONS` catalogue the product gates modules on.
 *
 * What lives here is the part that is genuinely the landing site's job under the
 * Admin/landing boundary: the story. A buyer does not want a module list, they
 * want to know which problem each area removes. Putting that prose in Admin
 * would make Admin a CMS; putting entitlements here would make the website a
 * second entitlement database. Both were explicitly ruled out.
 *
 * Keys map to `categoryKey` from the catalogue. A category with no entry here
 * still renders — it falls back to the catalogue's own label and descriptions,
 * so adding a feature server-side can never make the page crash or silently
 * drop a capability customers are paying for.
 */

export type CategoryStory = {
  /** Buyer-facing section title, replacing the internal category label. */
  title: string;
  /** The problem this area removes, in one line. */
  problem: string;
  /** Why it matters, two sentences at most. */
  body: string;
};

export const CATEGORY_STORIES: Record<string, CategoryStory> = {
  "core-hr": {
    title: "People management",
    problem:
      "Employee records living in spreadsheets, shared drives and someone's inbox.",
    body: "One record per employee, with the reporting lines, employment history and documents attached to it. Structure your organization into business units, departments and teams, and let employees keep their own details current.",
  },
  workforce: {
    title: "Attendance, leave and time",
    problem:
      "Chasing people to find out who worked, who was late, and who is off next week.",
    body: "Capture attendance, handle corrections and exceptions, and run leave from policy through balance to approval. Timesheets turn the same time data into something payroll can use.",
  },
  "work-management": {
    title: "Projects and delivery",
    problem: "No clear view of who is allocated to what, or for how long.",
    body: "Track projects and the people assigned to them, and connect that allocation to the timesheets your team already submits.",
  },
  talent: {
    title: "Hiring and onboarding",
    problem:
      "A hire disappears between the offer and their first day, then arrives with nothing set up.",
    body: "Run openings, candidates, applications and interviews in one pipeline, then carry the person straight into onboarding tasks and an employee record — without retyping anything.",
  },
  "payroll-finance": {
    title: "Payroll and compensation",
    problem:
      "Rebuilding the same payroll spreadsheet every cycle from data that lives somewhere else.",
    body: "Salary packages, pay components, allowances, deductions and loans feed payroll cycles that produce payslips. Attendance and timesheet data is already in the system, so the inputs are the ones your team recorded.",
  },
  platform: {
    title: "Documents, notifications and configuration",
    problem:
      "Every team needs something slightly different, and the tool cannot bend.",
    body: "Store employee and candidate documents with categories and expiry tracking, keep people informed through notifications, and present the product with your organization's own branding.",
  },
};

/**
 * Section ordering on the public page.
 *
 * Deliberately commercial rather than the catalogue's `categoryOrder`, which
 * exists to organise a settings screen. A buyer evaluates people, then time,
 * then pay — so payroll is not last here even though it sorts last internally.
 *
 * Any category not listed renders after these, in catalogue order, so a new
 * category cannot vanish from the page just because nobody updated this list.
 */
export const CATEGORY_DISPLAY_ORDER = [
  "core-hr",
  "workforce",
  "payroll-finance",
  "talent",
  "work-management",
  "platform",
];

/**
 * The connected lifecycle shown on the features page.
 *
 * Every stage here corresponds to a capability verified present in the product
 * — each maps to a real feature key in the catalogue, and the stages are
 * rendered only when the backend actually returns those keys. It is a claim
 * about how the modules connect, so it must not outlive the modules.
 */
export const LIFECYCLE_STAGES = [
  { featureKey: "recruitment", label: "Hire" },
  { featureKey: "onboarding", label: "Onboard" },
  { featureKey: "employees", label: "Employee record" },
  { featureKey: "attendance", label: "Attendance" },
  { featureKey: "leave", label: "Leave" },
  { featureKey: "timesheets", label: "Timesheets" },
  { featureKey: "payroll", label: "Payroll" },
  { featureKey: "documents", label: "Documents" },
];

/**
 * Business outcomes for the hero band.
 *
 * Each is a claim about what the product does, and each is backed by modules
 * verified to exist. Nothing here asserts uptime, certification, compliance
 * status or security properties — those need evidence this repository does not
 * hold, and stating them would be inventing trust.
 */
export const CORE_OUTCOMES = [
  {
    title: "One system, not seven",
    body: "Hiring, employee records, attendance, leave, timesheets and payroll share the same data instead of being reconciled between tools.",
  },
  {
    title: "Built to be configured",
    body: "Turn on the modules your organization actually uses, and shape roles, structure and approvals around how your team already works.",
  },
  {
    title: "Grows with your headcount",
    body: "Move between plans as your team grows, and add the modules you need when you need them.",
  },
];

/**
 * Platform capabilities, kept deliberately out of the main feature sections.
 *
 * These are real, but giving "role-based access" the same prominence as payroll
 * describes the software to an engineer rather than the product to a buyer. Each
 * line is phrased as what a customer gets, and each is verified: roles and
 * permissions, audit history, import/export, module enablement and attendance
 * device integration all exist as implemented modules.
 */
export const PLATFORM_CAPABILITIES = [
  {
    title: "Role-based access",
    body: "Decide who can see and change what, down to individual records.",
  },
  {
    title: "Configurable modules",
    body: "Enable only the parts of the platform your organization needs.",
  },
  {
    title: "Attendance device integration",
    body: "Connect supported biometric and attendance devices so punches arrive automatically.",
  },
  {
    title: "Import and export",
    body: "Bring existing employee data in, and get your data back out.",
  },
  {
    title: "Audit history",
    body: "See what changed, when, and who changed it.",
  },
  {
    title: "Reporting",
    body: "Operational views across attendance, leave, payroll and headcount.",
  },
];
