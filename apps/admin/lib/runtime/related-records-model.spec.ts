import { getPlatformModuleDefinition } from "./platform-module-registry";
import type { RuntimeColumnDefinition } from "./platform-runtime.types";
import {
  copyText,
  isRowActionVisible,
  relatedCellValue,
  resolveRowActionPath,
  shareableUrl,
} from "./related-records-model";
import { lookupDisplayFallback } from "./lookup-display-fallback";

/*
 * EXECPLAN-0055 WP-08 — subgrid cells honour their column format and link,
 * referral links are copied from the URL the API built, and row commands go to
 * the record's own route.
 */
const partners = getPlatformModuleDefinition("partners");
const referralLinks = partners.relatedRecords!.find(
  (item) => item.key === "referralLinks",
)!;
const action = (key: string) =>
  referralLinks.rowActions!.find((item) => item.key === key)!;
const column = (
  field: string,
  format?: RuntimeColumnDefinition["format"],
  extra: Partial<RuntimeColumnDefinition> = {},
): RuntimeColumnDefinition => ({ key: field, field, label: field, format, ...extra });

describe("related cell formatting", () => {
  it("formats currency in the row's own currency", () => {
    expect(
      relatedCellValue(
        { commissionAmount: 1250, currencyCode: "USD" },
        column("commissionAmount", "currency"),
      ),
    ).toEqual({ kind: "text", text: "$1,250.00" });
  });

  it("keeps a legacy currency code Intl rejects visible next to the amount", () => {
    expect(
      relatedCellValue(
        { commissionAmount: 10, currencyCode: "5" },
        column("commissionAmount", "currency"),
      ),
    ).toEqual({ kind: "text", text: "10.00 5" });
  });

  it("formats percentages, counts and statuses", () => {
    expect(
      relatedCellValue({ rate: "12.5" }, column("rate", "percentage")),
    ).toEqual({ kind: "text", text: "12.5%" });
    expect(
      relatedCellValue({ submissionCount: 3 }, column("submissionCount", "number")),
    ).toEqual({ kind: "text", text: "3" });
    expect(
      relatedCellValue({ status: "NOT_INVITED" }, column("status", "status")),
    ).toEqual({ kind: "status", text: "Not Invited" });
  });

  it("honours a column link, and leaves the cell plain when the id is missing", () => {
    const linked = column("convertedCustomerName", "text", {
      link: { route: "/customers", idField: "convertedCustomerId" },
    });
    expect(
      relatedCellValue(
        { convertedCustomerName: "Contoso", convertedCustomerId: "c-1" },
        linked,
      ),
    ).toEqual({ kind: "text", text: "Contoso", href: "/customers/c-1" });
    expect(
      relatedCellValue({ convertedCustomerName: "Contoso" }, linked),
    ).toEqual({ kind: "text", text: "Contoso" });
  });

  it("shows an empty cell for missing values and the epoch sentinel", () => {
    expect(relatedCellValue({}, column("referredOn", "dateTime"))).toEqual({
      kind: "empty",
    });
    expect(
      relatedCellValue(
        { referredOn: "1970-01-01T00:00:00.000Z" },
        column("referredOn", "dateTime"),
      ),
    ).toEqual({ kind: "empty" });
  });

  it("still reads an undeclared timestamp column as a date", () => {
    const cell = relatedCellValue(
      { createdAt: "2026-10-08T10:00:00.000Z" },
      column("createdAt", "text"),
    );
    expect(cell.kind).toBe("text");
    expect(cell.kind === "text" && cell.text).toMatch(/2026/);
  });

  it("falls back from the generic Record column to the row's own name", () => {
    expect(
      relatedCellValue({ contractNumber: "C-1" }, column("displayName")),
    ).toEqual({ kind: "text", text: "C-1" });
  });
});

describe("referral link copy", () => {
  const row = {
    id: "link-1",
    status: "ACTIVE",
    url: "https://www.example.test/request-demo?ref=DP-P-1",
  };

  it("copies the URL the API built from the public site", async () => {
    const writes: string[] = [];
    const clipboard = { writeText: async (text: string) => void writes.push(text) };
    expect(await copyText(shareableUrl(row.url)!, clipboard)).toBe(true);
    expect(writes).toEqual([row.url]);
  });

  it("reports a copy that could not happen instead of failing silently", async () => {
    expect(await copyText("x", undefined)).toBe(false);
    expect(
      await copyText("x", {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });

  it("offers Copy link only for a row with an absolute http(s) URL", () => {
    expect(isRowActionVisible(action("copy-link"), row)).toBe(true);
    expect(isRowActionVisible(action("copy-link"), { ...row, url: null })).toBe(false);
    expect(shareableUrl("/request-demo?ref=X")).toBeNull();
    expect(shareableUrl("javascript:alert(1)")).toBeNull();
  });

  it("offers Disable and Regenerate on active links and Enable on disabled ones", () => {
    expect(isRowActionVisible(action("disable-link"), row)).toBe(true);
    expect(isRowActionVisible(action("regenerate-link"), row)).toBe(true);
    expect(isRowActionVisible(action("enable-link"), row)).toBe(false);
    const disabled = { ...row, status: "DISABLED" };
    expect(isRowActionVisible(action("disable-link"), disabled)).toBe(false);
    expect(isRowActionVisible(action("enable-link"), disabled)).toBe(true);
  });

  it("calls the partner's own referral-link action route", () => {
    expect(resolveRowActionPath(action("disable-link"), "partner-1", row)).toBe(
      "/api/partners/partner-1/referral-links/link-1/action",
    );
    expect(action("disable-link").body).toEqual({ action: "disable" });
    expect(action("regenerate-link").body).toEqual({ action: "regenerate" });
  });
});

describe("lookup display fallback (legacy currency)", () => {
  const currency = partners.forms
    .find((form) => form.key === "detail")!
    .fields.find((field) => field.key === "currencyCode")!;

  it("shows a stored currency code outside the catalog as stored, not Not set", () => {
    expect(lookupDisplayFallback(currency, "5")).toBe("5");
  });

  it("never prints an unresolved record id", () => {
    expect(
      lookupDisplayFallback(
        { options: undefined, submitsLabel: false },
        "ec7dbbe3-1179-4465-990f-06427a4ab59f",
      ),
    ).toBeNull();
    expect(lookupDisplayFallback(currency, "")).toBeNull();
  });
});
