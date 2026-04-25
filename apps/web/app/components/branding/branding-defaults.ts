export const DEFAULT_BRANDING_VALUES = {
  appTitle: "DijiPeople",
  brandName: "DijiPeople",
  shortBrandName: "DijiPeople",
  portalTagline: "Manage your people operations from one place.",
  welcomeTitle: "People operations, without the mess.",
  welcomeSubtitle:
    "A clean HR workspace for admins, HR teams, managers, and employees.",
  footerText: "Powered by DijiPeople",
  dashboardGreeting: "Welcome back",
  employeePortalMessage:
    "Track your HR workflows, updates, and actions from one place.",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#0f766e",
  secondaryColor: "#115e59",
  accentColor: "#14b8a6",
  backgroundColor: "#f8fafc",
  surfaceColor: "#ffffff",
  textColor: "#0f172a",
  fontFamily: "INTER",
} as const;

export type BrandingDefaults = typeof DEFAULT_BRANDING_VALUES;

