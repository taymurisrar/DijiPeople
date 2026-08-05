import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      defaultControl: defaultControl(rawType, isEnum, isRelation, isList),
      defaultValue: readDefault(attributes),
    };
  }
  models[modelName] = { model: modelName, fields };
}

const modules = Object.fromEntries(
  Object.entries(moduleModels).map(([moduleKey, model]) => [
    moduleKey,
    { moduleKey, model, fields: models[model]?.fields ?? {} },
  ]),
);
// Adapter projections must still point to a real Prisma field. Contract editing
// exposes the active ContractVersion content through the Contract adapter.
modules.contracts.fields.contentHtml = {
  ...models.ContractVersion.fields.contentHtml,
  key: "contentHtml",
  sourcePath: "versions.contentHtml",
  relationProjection: true,
};
const manifest = {
  version: 1,
  generatedFrom: "services/api/prisma/schema.prisma",
  modules,
  models,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `Generated ${path.relative(root, outputPath)} with ${Object.keys(modules).length} runtime modules.`,
);

function defaultControl(type, isEnum, isRelation, isList) {
  if (isList) return "relatedRecords";
  if (isRelation) return "lookup";
  if (isEnum) return "option";
  if (type === "Boolean") return "boolean";
  if (type === "DateTime") return "dateTime";
  if (["Int", "BigInt"].includes(type)) return "integer";
  if (["Float", "Decimal"].includes(type)) return "decimal";
  if (type === "Json") return "hidden";
  if (type === "Bytes") return "file";
  return "text";
}

function readDefault(attributes) {
  const match = attributes.match(/@default\(([^)]*(?:\([^)]*\))?[^)]*)\)/);
  return match?.[1] ?? null;
}
