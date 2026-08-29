import {
  getSettingsAdapter,
  readSettingsListPagination,
  readSettingsRecords,
  settingsListApiPath,
} from "./settings-adapter-registry";

/**
 * BUG-2043 - the Audit Events screen reported the size of the page it fetched
 * as the tenant's total.
 *
 * The screen fetched `/audit-logs` with no `page` or `pageSize`, took the
 * server's default of 20 rows, and then handed the table `records.length` as
 * `totalItems` under client pagination. The footer read "Showing 1 to 20 of 20
 * records" over a log holding 305, and the response's own `meta.total` - which
 * said 305 - was never read.
 *
 * These assertions cover the two halves separately: that the requested page
 * reaches the API, and that the answer's total is the one reported.
 */
describe("settings list server pagination", () => {
  const auditAdapter = getSettingsAdapter("audit-logs");

  it("has an audit adapter that opts in to server pagination", () => {
    /*
     * The opt-in is what makes the rest of this fix reachable. Losing it turns
     * the screen back into a one-page fetch reporting its own length, which is
     * the defect, and nothing else here would fail.
     */
    expect(auditAdapter?.supportsServerPagination).toBe(true);
  });

  it("asks the API for the page the reader requested", () => {
    expect(settingsListApiPath(auditAdapter!, { page: 3, pageSize: 50 })).toBe(
      "/audit-logs?page=3&pageSize=50",
    );
  });

  it("keeps an adapter's own query parameters when adding a page", () => {
    const loginHistory = getSettingsAdapter("login-history");

    expect(settingsListApiPath(loginHistory!, { page: 2, pageSize: 25 })).toBe(
      "/audit-logs?entityType=AUTH_LOGIN&page=2&pageSize=25",
    );
  });

  it("clamps a page size the query DTO would reject", () => {
    /*
     * `AuditLogQueryDto` caps pageSize at 100 and the global ValidationPipe
     * answers an over-cap value with a 400. The number arrives from the URL, so
     * a hand-typed 5000 must not take the screen down.
     */
    expect(
      settingsListApiPath(auditAdapter!, { page: 1, pageSize: 5000 }),
    ).toBe("/audit-logs?page=1&pageSize=100");
  });

  it("leaves an adapter that cannot paginate untouched", () => {
    /*
     * `forbidNonWhitelisted` is on, so sending page/pageSize to an endpoint
     * whose DTO does not declare them is a 400 rather than a harmless extra.
     * Timezones is such an endpoint - it takes no query at all.
     */
    const timezones = getSettingsAdapter("timezones");

    expect(timezones?.supportsServerPagination).toBe(false);
    expect(settingsListApiPath(timezones!, { page: 2, pageSize: 25 })).toBe(
      "/configuration/timezones",
    );
  });

  it("reports the server's total, not the number of rows loaded", () => {
    const response = {
      items: Array.from({ length: 20 }, (_, index) => ({
        id: `audit-${index}`,
        action: "EMPLOYEE_CREATED",
      })),
      meta: { page: 1, pageSize: 20, total: 305, totalPages: 16 },
    };

    expect(readSettingsRecords(response, "items", auditAdapter!)).toHaveLength(
      20,
    );
    expect(readSettingsListPagination(response)).toEqual({
      page: 1,
      pageSize: 20,
      total: 305,
      totalPages: 16,
    });
  });

  it("reads a flat envelope as well as a nested one", () => {
    /*
     * The notifications module returns the counts beside `items` rather than
     * under `meta`. Both shapes are live, so both are read.
     */
    expect(
      readSettingsListPagination({
        items: [],
        page: 2,
        pageSize: 25,
        total: 61,
        totalPages: 3,
      }),
    ).toEqual({ page: 2, pageSize: 25, total: 61, totalPages: 3 });
  });

  it("derives totalPages when the API omits it", () => {
    expect(
      readSettingsListPagination({
        items: [],
        page: 1,
        pageSize: 20,
        total: 305,
      })?.totalPages,
    ).toBe(16);
  });

  it("reports an empty collection as a real total of zero", () => {
    expect(
      readSettingsListPagination({ items: [], meta: { total: 0 } })?.total,
    ).toBe(0);
  });

  it("returns null for a response carrying no envelope", () => {
    /*
     * A bare array really is the whole collection, so client pagination is the
     * honest mode there and the caller must be able to tell the difference.
     */
    expect(readSettingsListPagination([{ id: "a" }])).toBeNull();
    expect(readSettingsListPagination({ items: [{ id: "a" }] })).toBeNull();
    expect(readSettingsListPagination(null)).toBeNull();
  });

  it("ignores a total that is not a usable number", () => {
    expect(readSettingsListPagination({ meta: { total: "305" } })).toBeNull();
    expect(readSettingsListPagination({ meta: { total: -1 } })).toBeNull();
  });
});
