export const valueItems = [
  {
    title: "Run people operations from one system",
    description:
      "Keep employee records, hierarchy, documents, and HR workflows aligned in one platform instead of across scattered tools.",
  },
  {
    title: "Stabilize leave, attendance, and daily execution",
    description:
      "Give HR teams and managers clearer visibility into requests, attendance, approvals, and employee self-service.",
  },
  {
    title: "Connect hiring, onboarding, and access",
    description:
      "Move from candidate pipeline to onboarding tasks and employee access with cleaner handoffs and less admin friction.",
  },
  {
    title: "Stay ready for growth and SaaS control",
    description:
      "Support tenant-based features, approvals, documents, and configurable workflows without rebuilding your HR stack every quarter.",
  },
] as const;

export const industries = [
  {
    title: "Healthcare teams",
    description:
      "Support HR operations for clinics, hospitals, and care businesses that need disciplined employee data, attendance, and access control.",
  },
  {
    title: "Recruitment and staffing",
    description:
      "Keep candidate tracking, onboarding, assignment-heavy operations, and document handling organized as client demand scales.",
  },
  {
    title: "IT and service companies",
    description:
      "Give growing teams a practical operating layer for people data, timesheets, approvals, and HR workflows.",
  },
  {
    title: "Structured SMB operations",
    description:
      "Replace fragmented HR admin with a platform built for businesses that need process discipline without enterprise overhead.",
  },
] as const;

export const plans = [
  {
    name: "Starter",
    audience: "For teams creating a stronger HR operating baseline",
    description: "Clean HR structure without unnecessary complexity.",
    monthlyPriceUsd: 200,
    features: [
      "Core employee management",
      "Leave and attendance workflows",
      "Secure access and permissions",
    ],
    cta: "Request a demo",
  },
  {
    name: "Growth",
    audience: "For scaling teams with more operational complexity",
    description: "Built for teams that need more operational control and flexibility.",
    monthlyPriceUsd: 400,
    features: [
      "Recruitment and onboarding",
      "Timesheets and project-ready workflows",
      "Configurable tenant features",
    ],
    cta: "Talk to sales",
    featured: true,
  },
  {
    name: "Enterprise",
    audience: "For multi-team rollouts and tailored governance",
    description: "Advanced control for larger teams, deeper governance, and custom rollout needs.",
    monthlyPriceUsd: 800,
    features: [
      "Advanced document and approval flows",
      "Deeper controls and analytics",
      "Custom rollout support",
    ],
    cta: "Get a custom plan",
  },
] as const;

export const contactInfo = {
  businessEmail: "hello@dijipeople.com",
  supportEmail: "support@dijipeople.com",
  phone: "+1 (312) 555-0184",
} as const;

export const industryOptions = [
  "Healthcare",
  "IT / Software",
  "Recruitment",
  "Staffing",
  "Professional Services",
  "Other",
] as const;

export const currencyOptions = [
  {
    code: "USD",
    label: "US Dollar",
    symbol: "$",
    flag: "🇺🇸",
    monthlyRate: 1,
  },
  {
    code: "CAD",
    label: "Canadian Dollar",
    symbol: "CA$",
    flag: "🇨🇦",
    monthlyRate: 1.35,
  },
  {
    code: "GBP",
    label: "British Pound",
    symbol: "£",
    flag: "🇬🇧",
    monthlyRate: 0.79,
  },
  {
    code: "EUR",
    label: "Euro",
    symbol: "€",
    flag: "🇪🇺",
    monthlyRate: 0.92,
  },
  {
    code: "QAR",
    label: "Qatari Riyal",
    symbol: "QAR ",
    flag: "🇶🇦",
    monthlyRate: 3.64,
  },
] as const;

export const companySizeOptions = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
] as const;

export const interestedPlanOptions = ["Starter", "Growth", "Enterprise"] as const;
