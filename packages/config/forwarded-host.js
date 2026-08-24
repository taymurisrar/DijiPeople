/**
 * Whether `X-Forwarded-Host` / `Forwarded` may be believed, and the hostname
 * that follows from the answer.
 *
 * WHY THIS EXISTS. The hostname a request arrived on is the whole of the
 * workspace routing decision: it selects the tenant, its branding, and which
 * tenant's session cookies the browser will present next. `X-Forwarded-Host` is
 * a header, so anyone who can reach the server can set it. Believing it is
 * correct behind a proxy that overwrites it and a workspace-selection primitive
 * handed to strangers anywhere else.
 *
 * WHY IT LIVES HERE rather than in `services/api`. Three surfaces need the same
 * answer — the API (`main.ts` configuring Express, `proxy-trust.ts` reading a
 * request) and the tenant web app's middleware. The API's own
 * `common/security/proxy-trust.ts` records what happens when this question has
 * more than one implementation: "a deployment could end up trusting the
 * forwarded host while ignoring the forwarded address, and the rate limiter and
 * the tenant router would then disagree about what a request is. It is one
 * question, so it has one answer." A third copy in `apps/web` would be the
 * failure that comment was written to prevent, so the rule moved here instead —
 * the same reasoning, and the same home, as `client-ip.js`.
 *
 * The functions take an environment bag rather than a framework request, because
 * an Express `Request` and a Next.js `NextRequest` have nothing in common and
 * the decision depends on neither.
 */

const { normalizeHostname } = require("./platform-domains");

const TRUE_VALUES = Object.freeze(["1", "true", "yes", "on"]);
const FALSE_VALUES = Object.freeze(["0", "false", "no", "off"]);

/**
 * How many proxy hops to trust, or `false` for none.
 *
 * Explicit configuration wins, so a deployment can state the truth about its own
 * topology. Otherwise it is inferred from the hosting platform: Render and
 * Vercel both terminate TLS and forward, so one hop is correct there. Anything
 * else has to say so explicitly rather than be guessed at.
 *
 * An unrecognised explicit value returns `false` rather than falling through to
 * inference. "The deployment tried to configure this and got it wrong" must not
 * resolve to "trust the platform default" — that is how a typo becomes a
 * silently trusted header.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number | false}
 */
function resolveTrustProxySetting(env) {
  const configured =
    typeof env?.TRUST_PROXY_HEADERS === "string"
      ? env.TRUST_PROXY_HEADERS.trim().toLowerCase()
      : "";

  if (configured) {
    if (FALSE_VALUES.includes(configured)) return false;
    const hops = Number(configured);
    if (Number.isInteger(hops) && hops > 0) return hops;
    if (TRUE_VALUES.includes(configured)) return 1;
    return false;
  }

  return env?.RENDER === "true" || env?.VERCEL === "1" ? 1 : false;
}

/**
 * The same decision as a boolean, for callers that only need "believe it or not".
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function isForwardedHostTrusted(env) {
  return resolveTrustProxySetting(env) !== false;
}

/**
 * The first hop of a forwarded chain.
 *
 * A header can legitimately arrive as `client, proxy1, proxy2`, appended left to
 * right, so the first entry is the hop closest to the client. Reading the last
 * would let any intermediate hop rewrite the host.
 */
function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const first = raw.split(",")[0];
  return (typeof first === "string" ? first.trim() : "") || undefined;
}

/**
 * `Forwarded: host=example.com;proto=https` — RFC 7239. Only the first element
 * is read, for the same reason as above.
 */
function readForwardedHeaderHost(value) {
  const header = firstHeaderValue(value);
  if (!header) return undefined;
  const firstElement = header.split(",")[0] || "";
  const match = /host\s*=\s*"?([^;",]+)"?/i.exec(firstElement);
  return match ? match[1] : undefined;
}

const read = (headers, name) =>
  typeof headers?.get === "function" ? headers.get(name) : undefined;

/**
 * The forwarded host a proxy claims this request arrived on, normalized.
 *
 * `Forwarded` is read before `X-Forwarded-Host` because it is the standardised
 * form; both yield only their first hop. **Whether this may be believed is not
 * decided here** — the caller must have established that first.
 *
 * Exported so the API can pair it with its own Express-aware trust check without
 * restating the parsing. The "only the first hop" rule is security-relevant, and
 * a second copy of it is a second chance to read the chain from the wrong end.
 *
 * @param {{ get(name: string): string | null | undefined }} headers
 * @returns {string | null}
 */
function readForwardedHost(headers) {
  const claimed =
    readForwardedHeaderHost(read(headers, "forwarded")) ??
    firstHeaderValue(read(headers, "x-forwarded-host"));
  return normalizeHostname(claimed) || null;
}

/**
 * The normalized `Host` header, which is what the request actually carried.
 *
 * @param {{ get(name: string): string | null | undefined }} headers
 * @returns {string | null}
 */
function readHost(headers) {
  return normalizeHostname(firstHeaderValue(read(headers, "host"))) || null;
}

/**
 * The hostname a request actually arrived on.
 *
 * `Host` wins unless the deployment has declared a proxy in front. Nothing here
 * reads a tenant id — the hostname is the only routing input, and it is resolved
 * against the database afterwards, so a caller that lies about the host can only
 * ask about a workspace it could already ask about.
 *
 * `headers` is anything with a `get(name)` — a `Headers`, a `NextRequest`'s
 * headers, or a small adapter over Node's `IncomingHttpHeaders`.
 *
 * @param {{ get(name: string): string | null | undefined }} headers
 * @param {Record<string, string | undefined>} env
 * @returns {string | null} normalized hostname, or null when there is none
 */
function resolveForwardedHostname(headers, env) {
  if (isForwardedHostTrusted(env)) {
    const forwarded = readForwardedHost(headers);
    if (forwarded) return forwarded;
  }

  return readHost(headers);
}

module.exports = {
  isForwardedHostTrusted,
  readForwardedHost,
  readHost,
  resolveForwardedHostname,
  resolveTrustProxySetting,
};
