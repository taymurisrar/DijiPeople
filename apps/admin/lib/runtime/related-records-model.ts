import { formatCurrency, formatDate, formatNumber } from "@/lib/formatters";
import { humanizeLabel } from "./humanize-label";
import type {
  RuntimeColumnDefinition,
  RuntimeRelatedRowAction,
} from "./platform-runtime.types";
import { readRecordPath } from "./record-highlight";

/**
 * Subgrid cells, row commands and the referral-link copy action, as data
 * (EXECPLAN-0055 WP-08).
 *
 * Related panels printed every value raw: a currency column showed `1250`, a
 * percentage `10`, and a column's `link` was ignored — so a commission number
 * that the column declared as a link to the commission was inert text. The
 * related panel now formats a cell the way the list does, from the column's
 * declared `format`.
 */

export type RelatedCell =
  | { kind: "empty" }
  | { kind: "text"; text: string; href?: string; mono?: boolean }
  | { kind: "status"; text: string };

export function relatedCellValue(
  row: Record<string, unknown>,
  column: RuntimeColumnDefinition,
  reportingCurrency = "USD",
): RelatedCell {
  const resolved = readRecordPath(row, column.field);
  /*
   * The generic "Record" column reads `displayName`, which most related rows
   * do not have under that name; the first naming field they do have stands
   * in for it.
   */
  const value =
    column.field === "displayName" && (resolved == null || resolved === "")
      ? (row.title ??
        row.name ??
        row.companyName ??
        row.contractNumber ??
        row.requestNumber ??
        row.fileName)
      : resolved;
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && column.format !== "number")
  )
    return { kind: "empty" };
  const href = column.link
    ? linkHref(column.link.route, readRecordPath(row, column.link.idField))
    : undefined;
  const text = (content: string): RelatedCell =>
    href ? { kind: "text", text: content, href } : { kind: "text", text: content };

  /*
   * A column declared without a date format but naming a timestamp
   * (`createdAt`, `effectiveDate`) is still a date; the panel has always read
   * it as one.
   */
  const format =
    (column.format === undefined || column.format === "text") &&
    /(At|Date)$/.test(column.field) &&
    !Number.isNaN(new Date(String(value)).getTime())
      ? "dateTime"
      : column.format;

  switch (format) {
    case "status":
      return { kind: "status", text: enumLabel(String(value)) };
    case "currency": {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return text(String(value));
      const currency = String(
        (column.currencyField
          ? readRecordPath(row, column.currencyField)
          : undefined) ??
          row.currencyCode ??
          row.currency ??
          reportingCurrency,
      );
      try {
        return text(formatCurrency(amount, currency));
      } catch {
        // A legacy code Intl does not know ("5") — show the number and the code.
        return text(`${formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`);
      }
    }
    case "percentage": {
      const amount = Number(value);
      return Number.isFinite(amount)
        ? text(`${formatNumber(amount, { maximumFractionDigits: 2 })}%`)
        : text(String(value));
    }
    case "number":
      return text(
        formatNumber(Array.isArray(value) ? value.length : Number(value)),
      );
    case "date":
      return text(formatDate(String(value)));
    case "dateTime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) || date.getTime() === 0
        ? { kind: "empty" }
        : text(
            new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(date),
          );
    }
    default:
      break;
  }
  if (typeof value === "object") {
    const label = objectLabel(value as Record<string, unknown>);
    return label ? text(label) : { kind: "empty" };
  }
  const raw = String(value);
  // SCREAMING_SNAKE only ever comes from an enum column.
  return text(/^[A-Z][A-Z0-9_]*$/.test(raw) ? enumLabel(raw) : raw);
}

function linkHref(route: string, id: unknown) {
  if (id === null || id === undefined || !String(id).trim()) return undefined;
  return `${route}/${encodeURIComponent(String(id))}`;
}

function enumLabel(value: string) {
  return /^[A-Z][A-Z0-9_]*$/.test(value) ? humanizeLabel(value) : value;
}

function objectLabel(record: Record<string, unknown>) {
  const candidates = [
    record.fullName,
    record.displayName,
    record.companyName,
    record.name,
    [record.firstName, record.lastName].filter(Boolean).join(" ") || undefined,
  ];
  const found = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  return found ? String(found) : null;
}

/** Whether a row command applies to this row. */
export function isRowActionVisible(
  action: RuntimeRelatedRowAction,
  row: Record<string, unknown>,
) {
  if (action.kind === "copy" && !shareableUrl(row[action.field ?? ""]))
    return false;
  if (!action.visibleWhen) return true;
  return action.visibleWhen.in.includes(
    readRecordPath(row, action.visibleWhen.field),
  );
}

/** The `/api` path a `post` row command calls, with its tokens substituted. */
export function resolveRowActionPath(
  action: RuntimeRelatedRowAction,
  parentId: string,
  row: Record<string, unknown>,
) {
  if (!action.path) throw new Error(`Row action ${action.key} has no path.`);
  const path = action.path
    .replaceAll("{parentId}", encodeURIComponent(parentId))
    .replaceAll("{id}", encodeURIComponent(String(row.id ?? "")));
  return `/api${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A referral link's shareable URL — the one the API built from the configured
 * public site (`partnerReferralLinkUrl`). Only an absolute http(s) URL is
 * copied: anything else would put a broken link in a partner's email.
 */
export function shareableUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Copy text to the clipboard. Resolves false rather than throwing when the
 * clipboard is unavailable (insecure origin, denied permission), so the panel
 * can say so instead of the copy silently doing nothing.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = typeof navigator !==
  "undefined"
    ? navigator.clipboard
    : undefined,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
