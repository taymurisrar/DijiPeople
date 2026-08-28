import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeWriteContract } from "./lib/runtime-write-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "services/api/prisma/schema.prisma");
const outputPath = path.join(
  root,
  "packages/config/platform-runtime-schema.generated.json",
);
const schema = await readFile(schemaPath, "utf8");

const moduleModels = {
  leads: "Lead",
  partners: "Partner",
  "partner-inquiries": "PartnerInquiry",
  "partner-onboarding": "PartnerOnboardingApplication",
  customers: "CustomerAccount",
  "customer-onboarding": "CustomerOnboarding",
  tenants: "Tenant",
  subscriptions: "Subscription",
  plans: "Plan",
  invoices: "Invoice",
  payments: "Payment",
  commissions: "PartnerCommission",
  contracts: "Contract",
  "contract-templates": "ContractTemplate",
  "signature-requests": "SignatureRequest",
  "support-cases": "SupportCase",
  "monitoring-incidents": "ErrorLog",
};

const enumValues = Object.fromEntries(
  [...schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => [
    match[1],
    match[2]
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((line) => line && !line.startsWith("//")),
  ]),
);
const modelBodies = Object.fromEntries(
  [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((match) => [
    match[1],
    match[2],
  ]),
);
const scalarTypes = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);
const sensitivePattern =
  /(password|secret|token|session|privateKey|apiKey|signature|requestBody|stack|metadataJson|payloadJson)|^(cause|details)$/i;
const systemPattern =
  /^(id|createdAt|updatedAt|createdById|updatedById|deletedAt|version)$/;

const models = {};
for (const [modelName, body] of Object.entries(modelBodies)) {
  const fields = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const match = line.match(/^(\w+)\s+([\w]+)(\[\])?(\?)?\s*(.*)$/);
    if (!match) continue;
    const [, key, rawType, listMarker, optionalMarker, attributes] = match;
    const isEnum = Boolean(enumValues[rawType]);
    const isScalar = scalarTypes.has(rawType) || isEnum;
    const isRelation = !isScalar;
    const isList = Boolean(listMarker);
    const sensitive = sensitivePattern.test(key);
    const systemManaged =
      systemPattern.test(key) ||
      attributes.includes("@updatedAt") ||
      attributes.includes("@default(uuid())") ||
      attributes.includes("@default(cuid())");
    const readable = !sensitive;
    const writable =
      readable &&
      !systemManaged &&
      !isList &&
      rawType !== "Json" &&
      rawType !== "Bytes";
    fields[key] = {
      key,
      label: key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (letter) => letter.toUpperCase()),
      type: isRelation ? "relation" : isEnum ? "enum" : rawType,
      relationModel: isRelation ? rawType : null,
      required:
        !optionalMarker &&
        !isList &&
        !attributes.includes("@default(") &&
        !attributes.includes("@updatedAt"),
      nullable: Boolean(optionalMarker),
      list: isList,
      enumValues: enumValues[rawType] ?? [],
      readable,
      creatable: writable,
      editable: writable,
      filterable:
        readable && !isList && rawType !== "Json" && rawType !== "Bytes",
      sortable:
        readable &&
        !isList &&
        !isRelation &&
        rawType !== "Json" &&
        rawType !== "Bytes",
      searchable: readable && !isList && rawType === "String",
      exportable:
        readable && !sensitive && rawType !== "Json" && rawType !== "Bytes",
      systemManaged,
      sensitive,
      defaultControl: defaultControl(rawType, isEnum, isRelation, isList, key),
      defaultValue: readDefault(attributes),
    };
  }
  models[modelName] = { model: modelName, fields };
}

/*
 * `creatable` / `editable` answer "will the runtime accept this on a write?",
 * which is a question about the module's DTO — not about the Prisma column.
 *
 * Deriving them from the schema alone is what BUG-1743 was: `originChannel` is
 * a writable column, `UpdateCustomerDto` does not declare it, the form offered
 * it anyway, and `forbidNonWhitelisted` then rejected every customer edit. The
 * per-module workaround BUG-0220 applied to plans could not generalise, so the
 * derivation moves here, where every module is covered at once.
 *
 * A module with no create (or update) arm in the service switch cannot be
 * written through the runtime at all, so nothing is creatable (or editable)
 * there — such a request is answered with "not available for this module"
 * regardless of what the form chose to render.
 */
const writeContract = readRuntimeWriteContract(
  path.join(
    root,
    "services/api/src/modules/platform-runtime/platform-runtime.service.ts",
  ),
);

const modules = Object.fromEntries(
  Object.entries(moduleModels).map(([moduleKey, model]) => {
    const contract = writeContract[moduleKey];
    const fields = Object.fromEntries(
      Object.entries(models[model]?.fields ?? {}).map(([key, field]) => [
        key,
        {
          ...field,
          creatable: field.creatable && Boolean(contract?.creatable?.has(key)),
          editable: field.editable && Boolean(contract?.editable?.has(key)),
        },
      ]),
    );
    return [moduleKey, { moduleKey, model, fields }];
  }),
);
// Adapter projections must still point to a real Prisma field. Contract editing
// exposes the active ContractVersion content through the Contract adapter.
//
// `contentHtml` is writable but appears in no contract DTO: `update()`
// destructures it out of `values` before validating and routes it to
// `contracts.saveVersion`. So it is exempt from the DTO derivation above —
// the contract it satisfies is the destructuring, not `UpdateContractDto`.
//
// It is written to the model as well as the module. `resolveRuntimeField`
// resolves a form's field path through `models[module.model]`, not through
// `module.fields`, so a projection present only on the module fails the
// registry's own coverage check. That used to happen for free because the two
// were the same object by reference; deriving per-module `creatable`/`editable`
// means the module now holds its own copy, and the aliasing that was carrying
// this has to be stated instead.
const contentHtmlProjection = {
  ...models.ContractVersion.fields.contentHtml,
  key: "contentHtml",
  sourcePath: "versions.contentHtml",
  relationProjection: true,
};
models.Contract.fields.contentHtml = contentHtmlProjection;
modules.contracts.fields.contentHtml = contentHtmlProjection;
const manifest = {
  version: 1,
  generatedFrom: "services/api/prisma/schema.prisma",
  modules,
  models,
};
const rendered = JSON.stringify(manifest, null, 2) + "\n";
const relativeOutput = path.relative(root, outputPath);

/*
 * `--check` regenerates and compares instead of writing.
 *
 * This file is derived from `schema.prisma` and nothing verified it stayed that
 * way. `test:runtime-schema` validates the *registry* against this manifest, so
 * once the manifest fell behind the schema the two agreed and both were wrong:
 * `CustomerAccount.originChannel`, `Partner.partnershipModel`,
 * `Tenant.readinessStatus`, `Tenant.dataRegion` and
 * `Subscription.scheduledSeats` were real columns Platform Admin could not
 * display, and every existing check passed. The `stale-generated-artifact`
 * pattern, on the artifact that decides what an operator can see.
 *
 * Compared as parsed JSON rather than as text, so key ordering and a trailing
 * newline are never reported as drift.
 */
if (process.argv.includes("--check")) {
  let committed = null;
  try {
    committed = JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    console.error(
      "runtime schema: " + relativeOutput + " is missing or unreadable - run npm run generate:runtime-schema.",
    );
    process.exit(1);
  }

  const drift = describeManifestDrift(committed, manifest);
  if (drift.length) {
    console.error(
      "runtime schema: " + relativeOutput + " is stale against services/api/prisma/schema.prisma.",
    );
    for (const line of drift.slice(0, 40)) console.error("  " + line);
    if (drift.length > 40) console.error("  ... and " + (drift.length - 40) + " more");
    console.error("\nRun npm run generate:runtime-schema and commit the result.");
    process.exit(1);
  }

  console.log(
    "runtime schema: " + relativeOutput + " matches schema.prisma - " +
      Object.keys(modules).length + " module(s), " + Object.keys(models).length + " model(s).",
  );
} else {
  await writeFile(outputPath, rendered, "utf8");
  console.log(
    "Generated " + relativeOutput + " with " + Object.keys(modules).length + " runtime modules.",
  );
}

/**
 * Field-level drift, named. "The file differs" sends somebody into a 4 MB diff;
 * "customers is missing originChannel" tells them what changed and why it
 * matters.
 */
function describeManifestDrift(committed, expected) {
  const problems = [];
  const moduleKeys = new Set([
    ...Object.keys(committed.modules ?? {}),
    ...Object.keys(expected.modules ?? {}),
  ]);
  for (const key of [...moduleKeys].sort()) {
    const before = committed.modules?.[key];
    const after = expected.modules?.[key];
    if (!before) {
      problems.push(key + ": module missing from the committed manifest");
      continue;
    }
    if (!after) {
      problems.push(key + ": module no longer derived from the schema");
      continue;
    }
    if (before.model !== after.model) {
      problems.push(key + ": model " + before.model + " -> " + after.model);
    }
    const fieldKeys = new Set([
      ...Object.keys(before.fields ?? {}),
      ...Object.keys(after.fields ?? {}),
    ]);
    for (const field of [...fieldKeys].sort()) {
      const a = before.fields?.[field];
      const b = after.fields?.[field];
      if (!a) problems.push(key + ": missing field " + field);
      else if (!b) problems.push(key + ": stale field " + field);
      else if (JSON.stringify(a) !== JSON.stringify(b)) {
        problems.push(key + ": field " + field + " changed");
      }
    }
  }
  if (
    JSON.stringify(Object.keys(committed.models ?? {}).sort()) !==
    JSON.stringify(Object.keys(expected.models ?? {}).sort())
  ) {
    problems.push("models: the derived model list differs");
  }
  return problems;
}

function defaultControl(type, isEnum, isRelation, isList, name = "") {
  if (isList) return "relatedRecords";
  if (isRelation) return "lookup";
  if (isEnum) return "option";
  if (type === "Boolean") return "boolean";
  if (type === "DateTime") return "dateTime";
  if (["Int", "BigInt"].includes(type)) return "integer";
  if (["Float", "Decimal"].includes(type)) return semanticNumeric(name);
  if (type === "Json") return "hidden";
  if (type === "Bytes") return "file";
  return semanticText(name);
}

/**
 * What a `String` column is actually for, from what it is called.
 *
 * Prisma has one string type, so every email, phone number and URL in this
 * schema arrived as a plain text input: no `type="email"` and so no keyboard
 * or validation on mobile, no `tel:` semantics, and a Stripe invoice URL
 * rendered as an uneditable-looking string rather than a link. Four modules had
 * this on `email`, `phone`, `website` and `referrerUrl` at once, which is the
 * tell that it belongs here rather than in four hand-written field lists.
 *
 * Name-based inference is a heuristic, so it is deliberately narrow: suffixes
 * that are unambiguous in this schema, checked against the whole column name
 * rather than as a substring. `emailStatus` is a status, not an email, and
 * `phoneVerifiedAt` is a date — both would be caught by a looser rule.
 */
function semanticText(name) {
  const key = String(name ?? "");
  if (/(^|[a-z])Email$/i.test(key) || key.toLowerCase() === "email") {
    return "email";
  }
  if (
    /(^|[a-z])(Phone|PhoneNumber|Mobile)$/i.test(key) ||
    ["phone", "mobile", "phonenumber"].includes(key.toLowerCase())
  ) {
    return "phone";
  }
  if (/(Url|Uri|Website)$/i.test(key) || key.toLowerCase() === "website") {
    return "url";
  }
  return "text";
}

/**
 * Money reads as money.
 *
 * A `Decimal` named `amount`, `total` or `unitAmount` is a sum, and rendering
 * it as a bare number loses the currency and the fixed two-decimal formatting
 * that makes an invoice legible. Rates and percentages are excluded explicitly:
 * `taxRatePercent` is a Decimal too and is not a sum.
 */
function semanticNumeric(name) {
  const key = String(name ?? "");
  if (/(Percent|Rate|Ratio|Scale|Weight)$/i.test(key)) return "decimal";
  if (/(Amount|Price|Total|Subtotal|Balance|Cost|Fee)$/i.test(key)) {
    return "currency";
  }
  return "decimal";
}

function readDefault(attributes) {
  const match = attributes.match(/@default\(([^)]*(?:\([^)]*\))?[^)]*)\)/);
  return match?.[1] ?? null;
}
