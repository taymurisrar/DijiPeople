const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})T/;

export function normalizeRuntimeDateValue(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") return "";
  const raw = value.trim();
  const isoPrefix = ISO_DATE_PREFIX_PATTERN.exec(raw)?.[1];
  return isoPrefix ?? raw;
}

export function isValidRuntimeDateValue(value: unknown) {
  const normalized = normalizeRuntimeDateValue(value);
  const match = DATE_ONLY_PATTERN.exec(normalized);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
