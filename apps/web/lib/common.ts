export type GenerateCodeOptions = {
  digits?: number;
  existingValues?: Array<string | number | null | undefined>;
  maxAttempts?: number;
};

export function sanitizeNumericCode(value: string, maxDigits = 9) {
  return value.replace(/\D/g, "").slice(0, maxDigits);
}

export function generateUniqueNumberCode({
  digits = 5,
  existingValues = [],
  maxAttempts = 100,
}: GenerateCodeOptions = {}) {
  const safeDigits = Math.min(Math.max(digits, 1), 9);

  const min = safeDigits === 1 ? 1 : 10 ** (safeDigits - 1);
  const max = 10 ** safeDigits - 1;

  const usedValues = new Set(
    existingValues
      .filter(Boolean)
      .map((value) => String(value).trim()),
  );

  for (let index = 0; index < maxAttempts; index += 1) {
    const generatedValue = String(
      Math.floor(Math.random() * (max - min + 1)) + min,
    );

    if (!usedValues.has(generatedValue)) {
      return generatedValue;
    }
  }

  throw new Error("Unable to generate unique numeric code.");
}

export function formatEnumLabel(value?: string | null) {
  if (!value) return "";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function cn(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}
