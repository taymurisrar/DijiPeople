import { getRuntimeSchema } from "@repo/config";
import type { PlatformModuleKey } from "./platform-runtime.types";

type RuntimeSchemaField = {
  creatable?: boolean;
  editable?: boolean;
  required?: boolean;
  nullable?: boolean;
};

/**
 * Whether the runtime will accept this field on this kind of write.
 *
 * The answer lives in the generated manifest, which derives `creatable` and
 * `editable` from the module's create/update DTO rather than from the Prisma
 * column — see `scripts/lib/runtime-write-contract.mjs`. A field the DTO does
 * not declare is rejected by `forbidNonWhitelisted`, taking the whole request
 * with it, so it must never reach the payload.
 */
export function acceptsField(
  moduleKey: PlatformModuleKey,
  fieldKey: string,
  isCreate: boolean,
): boolean {
  const field = getRuntimeSchema(moduleKey)?.fields[fieldKey] as
    | RuntimeSchemaField
    | undefined;
  return Boolean(isCreate ? field?.creatable : field?.editable);
}

/**
 * What an empty optional field should be sent as — or whether to send it.
 *
 * An untouched optional control holds `""`, and `""` is not "absent".
 * `@IsOptional()` skips `null` and `undefined` and nothing else, so an
 * optional `@IsUUID()` field arriving as `""` fails validation and rejects the
 * entire request. That is BUG-1742: no lead could be created from Platform
 * Admin because the form serialized an unrendered, untouched `partnerId` as an
 * empty string, and there was no control anywhere on the form to clear it with.
 *
 * On create, absent is what the operator meant, so the key is omitted. On edit
 * the same blank has to mean "clear this", which `null` says and omission does
 * not — a cleared lookup that silently keeps its old value is the other half of
 * the same defect. A field that cannot hold null falls back to omission.
 *
 * Required fields are never reached: `validateRuntimeValues` rejects a blank
 * one before the payload is built.
 */
export function normalizeWriteValue(
  moduleKey: PlatformModuleKey,
  fieldKey: string,
  value: unknown,
  isCreate: boolean,
): { include: false } | { include: true; value: unknown } {
  if (value !== "") return { include: true, value };

  const field = getRuntimeSchema(moduleKey)?.fields[fieldKey] as
    | RuntimeSchemaField
    | undefined;
  if (field?.required) return { include: true, value };
  if (isCreate) return { include: false };
  return field?.nullable ? { include: true, value: null } : { include: false };
}

/**
 * The values a create or update request should actually carry.
 *
 * One choke point for both defects above: fields the DTO will not accept are
 * dropped, and empty optionals are normalized. Every admin module writes
 * through here, which is the difference between this and the per-module guard
 * BUG-0220 left behind.
 */
export function buildWritePayload(
  moduleKey: PlatformModuleKey,
  fields: Array<{ key: string }>,
  values: Record<string, unknown>,
  isCreate: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in values)) continue;
    if (!acceptsField(moduleKey, field.key, isCreate)) continue;
    const normalized = normalizeWriteValue(
      moduleKey,
      field.key,
      values[field.key],
      isCreate,
    );
    if (normalized.include) payload[field.key] = normalized.value;
  }
  return payload;
}
