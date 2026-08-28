import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  PLATFORM_RUNTIME_SCHEMA_MANIFEST,
  getRuntimeSchema,
} from "@repo/config";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import { buildWritePayload } from "./runtime-write-payload";
import type { PlatformModuleKey } from "./platform-runtime.types";

const RUNTIME_SERVICE = join(
  __dirname,
  "../../../../services/api/src/modules/platform-runtime/platform-runtime.service.ts",
);

/**
 * Every admin module's write path against the DTO that will receive it.
 *
 * `PlatformRuntimeService` validates with `forbidNonWhitelisted`, so a single
 * key the DTO does not declare rejects the entire save. BUG-0220 fixed that for
 * plans and left `plan-record-form.spec.ts` behind — a test that is plans-shaped
 * by construction and therefore passed for the eleven months customers and
 * partners were unsavable (BUG-1743).
 *
 * So this spec names no module. It reads the create/update switch out of the
 * service, walks every module the registry declares, and fails if any of them
 * would send a key its DTO cannot accept.
 *
 * The DTO parsing here is deliberately a second implementation of what
 * `scripts/lib/runtime-write-contract.mjs` does for the generator. Sharing it
 * would make this spec assert the generator against itself, and a parser bug
 * would then hide in both.
 */

function stripDecorators(line: string): string {
  let rest = line;
  while (rest.startsWith("@")) {
    let index = 1;
    while (index < rest.length && /[\w.]/.test(rest[index]!)) index += 1;
    if (rest[index] === "(") {
      let depth = 0;
      for (; index < rest.length; index += 1) {
        if (rest[index] === "(") depth += 1;
        else if (rest[index] === ")") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
      }
    }
    const next = rest.slice(index).trimStart();
    if (next === rest) break;
    rest = next;
  }
  return rest;
}

function classBody(source: string, className: string) {
  const declaration = new RegExp(
    `export\\s+class\\s+${className}\\b([^{]*)\\{`,
  ).exec(source);
  if (!declaration) return null;
  const open = declaration.index + declaration[0].length - 1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0)
        return {
          body: source.slice(open + 1, index),
          heritage: declaration[1]!,
        };
    }
  }
  return null;
}

function importMap(source: string, fromFile: string) {
  const map = new Map<string, string>();
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source))) {
    if (!match[2]!.startsWith(".")) continue;
    const file = resolve(dirname(fromFile), match[2]!) + ".ts";
    for (const raw of match[1]!.split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (name) map.set(name, file);
    }
  }
  return map;
}

function declaredProperties(
  file: string,
  className: string,
  seen = new Set<string>(),
): Set<string> {
  const marker = `${file}#${className}`;
  if (seen.has(marker)) return new Set();
  seen.add(marker);

  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return new Set();
  }
  const found = classBody(source, className);
  if (!found) return new Set();

  const properties = new Set<string>();
  let nesting = 0;
  for (const rawLine of found.body.split(/\r?\n/)) {
    const line = stripDecorators(rawLine.trim());
    if (nesting === 0 && !line.startsWith("//")) {
      const property = line.match(/^(?:readonly\s+)?([A-Za-z_]\w*)\s*[?!]?\s*:/);
      if (property) properties.add(property[1]!);
    }
    for (const character of rawLine) {
      if ("{[(".includes(character)) nesting += 1;
      else if ("}])".includes(character)) nesting -= 1;
    }
    if (nesting < 0) nesting = 0;
  }

  const base = found.heritage.match(/extends\s+(\w+)/);
  if (base) {
    const file2 = importMap(source, file).get(base[1]!) ?? file;
    for (const inherited of declaredProperties(file2, base[1]!, seen))
      properties.add(inherited);
  }
  return properties;
}

function methodBody(source: string, name: string) {
  const start = source.search(new RegExp(`\\basync\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const open = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return "";
}

function caseDtos(body: string) {
  const marks: Array<{ key: string; at: number }> = [];
  const caseRe = /case\s+'([\w-]+)'\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = caseRe.exec(body)))
    marks.push({ key: match[1]!, at: match.index });
  const result: Record<string, string> = {};
  marks.forEach((mark, index) => {
    const slice = body.slice(
      mark.at,
      index + 1 < marks.length ? marks[index + 1]!.at : body.length,
    );
    const dto = slice.match(/\bdto\(\s*(\w+)\s*,/);
    if (dto) result[mark.key] = dto[1]!;
  });
  return result;
}

const serviceSource = readFileSync(RUNTIME_SERVICE, "utf8");
const serviceImports = importMap(serviceSource, RUNTIME_SERVICE);
const createDtos = caseDtos(methodBody(serviceSource, "create"));
const updateDtos = caseDtos(methodBody(serviceSource, "update"));

/*
 * Fields the runtime accepts outside its DTO. `update()` destructures
 * `contentHtml` out of `values` and routes it to `contracts.saveVersion`, so it
 * is contractually accepted while appearing in no DTO.
 */
const OUT_OF_BAND: Record<string, string[]> = { contracts: ["contentHtml"] };

function acceptedKeys(moduleKey: string, isCreate: boolean) {
  const dtoName = (isCreate ? createDtos : updateDtos)[moduleKey];
  if (!dtoName) return null;
  const file = serviceImports.get(dtoName);
  if (!file) return null;
  const keys = declaredProperties(file, dtoName);
  for (const extra of OUT_OF_BAND[moduleKey] ?? []) keys.add(extra);
  return keys;
}

describe("runtime write contract", () => {
  it("reads the service switch it asserts against", () => {
    expect(createDtos.leads).toBe("CreateAdminLeadDto");
    expect(updateDtos.customers).toBe("UpdateCustomerDto");
    expect(updateDtos.partners).toBe("UpdatePartnerDto");
    expect(acceptedKeys("customers", false)!.has("companyName")).toBe(true);
  });

  const moduleKeys = Object.keys(
    PLATFORM_RUNTIME_SCHEMA_MANIFEST.modules,
  ) as PlatformModuleKey[];

  it("covers every module the manifest declares", () => {
    expect(moduleKeys.length).toBeGreaterThan(10);
  });

  describe.each(moduleKeys)("%s", (moduleKey) => {
    const schema = getRuntimeSchema(moduleKey)!;

    it("marks writable only what the DTO declares", () => {
      for (const isCreate of [true, false]) {
        const accepted = acceptedKeys(moduleKey, isCreate);
        const flag = isCreate ? "creatable" : "editable";
        const claimed = Object.values(schema.fields)
          .filter((field) => (field as Record<string, boolean>)[flag])
          .map((field) => field.key);
        if (!accepted) {
          // No arm in the switch: the runtime refuses the write outright, so
          // nothing may be advertised as writable.
          expect([moduleKey, flag, claimed]).toEqual([moduleKey, flag, []]);
          continue;
        }
        const rejected = claimed.filter((key) => !accepted.has(key));
        expect([moduleKey, flag, rejected]).toEqual([moduleKey, flag, []]);
      }
    });

    it("never builds a payload the DTO would reject", () => {
      const definition = getPlatformModuleDefinition(moduleKey);
      for (const form of definition.forms) {
        for (const isCreate of [true, false]) {
          const accepted = acceptedKeys(moduleKey, isCreate);
          // Every field present and blank — the untouched-form shape that
          // sent `partnerId: ""` and made lead creation impossible.
          const values = Object.fromEntries(
            form.fields.map((field) => [field.key, ""]),
          );
          const payload = buildWritePayload(
            moduleKey,
            form.fields.filter((field) => !field.readOnly),
            values,
            isCreate,
          );
          const rejected = Object.keys(payload).filter(
            (key) => !accepted?.has(key),
          );
          expect([moduleKey, form.key, rejected]).toEqual([
            moduleKey,
            form.key,
            [],
          ]);
        }
      }
    });
  });
});

describe("empty optional values", () => {
  /*
   * BUG-1742. `@IsOptional()` skips `null` and `undefined` and nothing else, so
   * an optional `@IsUUID()` arriving as `""` failed and took the request with
   * it. Leads had no Partner control at all, so `""` was the only value the
   * form could ever produce for it.
   */
  it("omits an untouched optional lookup on create", () => {
    const payload = buildWritePayload(
      "leads",
      [{ key: "partnerId" }, { key: "companyName" }],
      { partnerId: "", companyName: "Acme" },
      true,
    );
    expect("partnerId" in payload).toBe(false);
    expect(payload.companyName).toBe("Acme");
  });

  it("clears a nullable optional with null on edit rather than dropping it", () => {
    const payload = buildWritePayload(
      "leads",
      [{ key: "partnerId" }],
      { partnerId: "" },
      false,
    );
    expect(payload).toEqual({ partnerId: null });
  });

  it("keeps a non-empty value untouched", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      buildWritePayload("leads", [{ key: "partnerId" }], { partnerId: id }, true),
    ).toEqual({ partnerId: id });
  });
});
