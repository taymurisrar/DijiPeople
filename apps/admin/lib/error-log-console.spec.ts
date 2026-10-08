import {
  buildErrorLogApiQuery,
  canonicalizeLegacyView,
  describePeriod,
  formatPayload,
  formatRequest,
  formatSourceApp,
  severityGroupOf,
  summarizeMessage,
} from "./error-log-console";

/*
 * The error-log console's URL ↔ API contract and its presentation rules.
 * Which parameters reach `GET /platform/logs/events` matters doubly: the API
 * rejects an undeclared key with a 400 (`forbidNonWhitelisted`), and a key that
 * is silently dropped is a filter that looks applied and is not.
 */

describe("buildErrorLogApiQuery", () => {
  it("forwards every filter the console sets", () => {
    const query = new URLSearchParams(
      buildErrorLogApiQuery({
        search: "payroll",
        severity: "critical",
        status: "UNRESOLVED",
        sourceApp: "api",
        environment: "production",
        module: "payroll",
        tenantId: "tenant-1",
        period: "24h",
        page: "2",
        sortBy: "lastSeen",
        sortDirection: "asc",
      }),
    );
    expect(Object.fromEntries(query)).toEqual({
      search: "payroll",
      severity: "critical",
      status: "UNRESOLVED",
      sourceApp: "api",
      environment: "production",
      module: "payroll",
      tenantId: "tenant-1",
      period: "24h",
      page: "2",
      sortBy: "lastSeen",
      sortDirection: "asc",
      pageSize: "25",
    });
  });

  it("never forwards the drawer reference or an unrelated parameter", () => {
    const query = new URLSearchParams(
      buildErrorLogApiQuery({ ref: "req_1", utm_source: "mail", viewId: "x" }),
    );
    expect(query.has("ref")).toBe(false);
    expect(query.has("utm_source")).toBe(false);
    expect(query.has("viewId")).toBe(false);
  });

  it("drops `period=all`, which is the absence of a window", () => {
    expect(buildErrorLogApiQuery({ period: "all" })).toBe("pageSize=25");
  });

  it("keeps an old link's exact-match filters working", () => {
    const query = new URLSearchParams(
      buildErrorLogApiQuery({ correlationId: "req_abc", route: "/api/x" }),
    );
    expect(query.get("correlationId")).toBe("req_abc");
    expect(query.get("route")).toBe("/api/x");
  });

  it("takes the first value of a repeated parameter and trims it", () => {
    const query = new URLSearchParams(
      buildErrorLogApiQuery({ search: ["  acme ", "other"] }),
    );
    expect(query.get("search")).toBe("acme");
  });
});

describe("canonicalizeLegacyView", () => {
  it("returns null when there is nothing to rewrite", () => {
    expect(canonicalizeLegacyView({ status: "RESOLVED" })).toBeNull();
  });

  it("turns the dashboard's viewId=open into the visible Unresolved filter", () => {
    expect(canonicalizeLegacyView({ viewId: "open" })).toBe(
      "status=UNRESOLVED",
    );
  });

  it("turns the critical view into the severity group", () => {
    expect(canonicalizeLegacyView({ viewId: "critical", page: "2" })).toBe(
      "page=2&severity=critical",
    );
  });

  it("does not override a filter the link already sets", () => {
    expect(canonicalizeLegacyView({ viewId: "resolved", status: "NEW" })).toBe(
      "status=NEW",
    );
  });

  it("drops `all` and an unknown view to an unfiltered list", () => {
    expect(canonicalizeLegacyView({ viewId: "all" })).toBe("");
    expect(canonicalizeLegacyView({ viewKey: "mystery" })).toBe("");
  });
});

describe("presentation", () => {
  it("groups stored severities the way the API filters them", () => {
    expect(severityGroupOf("error")).toBe("critical");
    expect(severityGroupOf("FATAL")).toBe("critical");
    expect(severityGroupOf("critical")).toBe("critical");
    expect(severityGroupOf("warn")).toBe("warning");
    expect(severityGroupOf("INFO")).toBe("info");
    expect(severityGroupOf("debug")).toBe("other");
  });

  it("prefers the group the API computed", () => {
    expect(severityGroupOf("error", "warning")).toBe("warning");
    expect(severityGroupOf("error", "nonsense")).toBe("critical");
  });

  it("names the applications rather than echoing their codes", () => {
    expect(formatSourceApp("web")).toBe("Tenant app");
    expect(formatSourceApp("admin")).toBe("Platform admin");
    expect(formatSourceApp("api")).toBe("API");
    expect(formatSourceApp("gateway")).toBe("Gateway");
    expect(formatSourceApp(null)).toBe("Unknown");
  });

  it("shows one bounded line of a message, never a stack", () => {
    expect(summarizeMessage("Boom\n    at handler (x.ts:1)")).toBe("Boom");
    const long = summarizeMessage("x".repeat(300), 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith("…")).toBe(true);
    expect(summarizeMessage("")).toBe("No message recorded");
  });

  it("describes a request without its query string", () => {
    expect(formatRequest("GET", "/api/employees?search=jane")).toBe(
      "GET /api/employees",
    );
    expect(formatRequest("CLIENT", "/payroll")).toBe("/payroll");
    expect(formatRequest(null, null)).toBe("");
  });

  it("names the window the metrics were counted over", () => {
    expect(describePeriod({ period: "7d" })).toBe("last 7 days");
    expect(describePeriod({ period: "all" })).toBe("all time");
    expect(describePeriod({ from: "2026-10-01" })).toBe("selected dates");
    expect(describePeriod({})).toBe("all time");
  });

  it("treats an empty payload as nothing to show", () => {
    expect(formatPayload({})).toBeNull();
    expect(formatPayload(null)).toBeNull();
    expect(formatPayload({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
