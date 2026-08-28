/**
 * Security response headers for the three Next apps.
 *
 * BUG-0040. None of `apps/web`, `apps/admin` or `apps/landing` set any: no
 * `Content-Security-Policy`, no frame protection, no HSTS, no
 * `X-Content-Type-Options`, no `Referrer-Policy`. The tenant product is the one
 * that matters most — it renders payroll, bank details and HR records, and
 * without `frame-ancestors` any site could frame it.
 *
 * One definition shared by all three, because three copies of a header policy
 * drift and the drift is invisible until someone audits it.
 */

/**
 * Headers that cannot break a working application. These are enforced.
 *
 * Each is a statement about how the browser should treat a response we already
 * control, not a restriction on what the page may load — so there is no way for
 * one to reject a legitimate resource.
 */
function baselineSecurityHeaders({ frameable = false } = {}) {
  return [
    // MIME sniffing turns an uploaded document into an executable script.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Referrer to third parties is trimmed to the origin; same-origin keeps the
    // full path. Tenant URLs contain record ids, which are not for other hosts.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Legacy counterpart of frame-ancestors, still honoured by some agents.
    { key: "X-Frame-Options", value: frameable ? "SAMEORIGIN" : "DENY" },
    // Features nothing in these apps uses. The attendance agent is a separate
    // Electron app; geolocation there is not affected by this header.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    // Two years, subdomains included. Only meaningful over HTTPS; browsers
    // ignore it on plain HTTP, so it is safe to send everywhere.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
  ];
}

/**
 * The content security policy, **as Report-Only**.
 *
 * WHY REPORT-ONLY AND NOT ENFORCED. A CSP is the one header here that can break
 * a working product: a directive slightly too tight blanks a page, and Next.js
 * emits inline bootstrap script and inline styles whose exact shape depends on
 * the build. Shipping an enforced policy that has never been observed in a real
 * browser would be trading a missing header for an outage.
 *
 * Report-Only is the standard rollout: the browser evaluates the policy, reports
 * what *would* have been blocked, and changes nothing. Enforcement is a
 * deliberate follow-up once real reports show the policy is clean — tracked as
 * ITEM-0039 rather than left as an intention.
 *
 * `frame-ancestors` is the exception and is enforced above via
 * `X-Frame-Options`, because clickjacking protection is worth having
 * immediately and that header cannot break a page the way a script directive
 * can.
 */
function contentSecurityPolicy({ apiOrigin } = {}) {
  const connectSrc = ["'self'"];
  if (apiOrigin) connectSrc.push(apiOrigin);

  return [
    "default-src 'self'",
    // Next.js injects an inline bootstrap; without 'unsafe-inline' the app does
    // not start. This is precisely why the policy ships report-only first.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * The `headers()` value for a Next config.
 *
 * @param {{ apiOrigin?: string, frameable?: boolean }} options
 */
/**
 * Whether an API origin is one a browser on an HTTPS page could ever reach.
 *
 * The landing site shipped a CSP permitting `http://api.dijipeople.com/api`
 * while admin and the tenant app permitted `https://` — one environment
 * variable, configured with the wrong scheme (BUG-1822). On an HTTPS page a
 * plain-http origin is blocked as mixed content before CSP is consulted, so the
 * clause was there and matched nothing: harmless while the policy is
 * report-only, and a live break for checkout the moment anyone enforces it.
 *
 * Loopback stays allowed, because `http://localhost:4000` is the correct local
 * answer. Anything else over plain http is the same class of mistake this
 * module already refuses elsewhere: a development value that reached
 * production, raised at build time rather than discovered by a customer.
 */
function assertUsableApiOrigin(apiOrigin) {
  if (!apiOrigin) return;
  let parsed;
  try {
    parsed = new URL(String(apiOrigin));
  } catch {
    // Not a URL this can reason about. `getApiBaseUrl` owns that complaint.
    return;
  }
  if (parsed.protocol !== "http:") return;
  if (LOOPBACK_HOSTS.includes(parsed.hostname.toLowerCase())) return;

  throw new Error(
    `Content-Security-Policy would permit the API over plain http ` +
      `("${apiOrigin}"). A browser on an HTTPS page blocks that as mixed ` +
      `content before CSP is consulted, so the connect-src entry matches ` +
      `nothing and every API call violates the policy. Configure the API base ` +
      `URL with https. See BUG-1822.`,
  );
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];

function securityHeadersForApp(options = {}) {
  assertUsableApiOrigin(options.apiOrigin);
  return [
    {
      source: "/:path*",
      headers: [
        ...baselineSecurityHeaders(options),
        {
          key: "Content-Security-Policy-Report-Only",
          value: contentSecurityPolicy(options),
        },
      ],
    },
  ];
}

module.exports = {
  baselineSecurityHeaders,
  contentSecurityPolicy,
  securityHeadersForApp,
  assertUsableApiOrigin,
};
