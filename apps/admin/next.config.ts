import type { NextConfig } from "next";
import {
  validateDeploymentEnv,
  securityHeadersForApp,
  getApiBaseUrl,
} from "@repo/config";

validateDeploymentEnv(process.env, { app: "admin" });

const nextConfig: NextConfig = {
  /*
   * BUG-0040 — this app shipped no security response headers at all.
   *
   * Defined once in @repo/config and shared by all three apps: three copies
   * of a header policy drift, and the drift is invisible until an audit.
   *
   * The CSP is Report-Only on purpose. It is the one header here that can
   * break a working product, and it has never been observed in a real
   * browser against this build. Clickjacking protection is NOT deferred with
   * it — X-Frame-Options is enforced immediately. See ITEM-0039.
   *
   * `geolocation: true` matches the tenant app (BUG-2331). Admin has no
   * location-aware screen today; it is enabled deliberately so that platform
   * staff reproducing a tenant's attendance problem hit the same browser
   * behaviour the tenant does, rather than a header difference that makes the
   * defect look tenant-specific. `(self)` only permits this origin to *ask*.
   */
  async headers() {
    return securityHeadersForApp({
      apiOrigin: getApiBaseUrl(),
      geolocation: true,
    });
  },
  poweredByHeader: false,
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
