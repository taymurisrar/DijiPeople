import { getApiBaseUrl as getSharedApiBaseUrl, resolveAppUrls } from "@repo/config";

// Cross-app URLs come from @repo/config and nowhere else. Resolving one here
// with a local `|| "http://localhost:3000"` fallback is what shipped a loopback
// "Login" link to production: nothing required the variable, so the build
// succeeded and Next inlined the fallback into the static HTML.
//
// resolveAppUrls throws in production-like environments when a URL is missing,
// and apps/landing/next.config.ts calls validateDeploymentEnv before the build
// starts — so by the time this module evaluates, the values are known good.
const appUrls = resolveAppUrls(process.env);

export const landingEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DijiPeople",
  appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || appUrls.landing,
  /** The tenant workspace this site sends visitors to for sign-in. */
  workspaceUrl: appUrls.web,
  adminUrl: appUrls.admin,
  apiBaseUrl: getSharedApiBaseUrl(process.env),
};
