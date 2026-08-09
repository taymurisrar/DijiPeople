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
  /*
   * The logo stays empty: this is a white-label platform, so a tenant without
   * its own artwork shows its name rather than the vendor's mark. The favicon
   * is platform chrome and a tenant can still override it.
   */
  logoUrl: "",
  logoDarkUrl: "",
  faviconUrl: "/favicon.ico",
  primaryColor: "#059669",
  secondaryColor: "#047857",
  accentColor: "#34D399",
  backgroundColor: "#f8fafc",
  surfaceColor: "#ffffff",
  textColor: "#0f172a",
  fontFamily: "INTER",
} as const;

export type BrandingDefaults = typeof DEFAULT_BRANDING_VALUES;

