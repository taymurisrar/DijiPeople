import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Which fields the platform runtime will actually accept on a write.
 *
 * `creatable` and `editable` used to be derived from `schema.prisma` alone —
 * "is this a writable column?" — while `PlatformRuntimeService.create/update`
 * validates the same payload against a per-module DTO with
 * `forbidNonWhitelisted: true`. Those are two statements about different
 * things, and nothing reconciled them: any writable column the DTO did not
 * declare became an editable form field whose presence then rejected the whole
 * request. That is BUG-0220 (fixed for plans by hand), and BUG-1743 — the same
 * defect still live on customers (`originChannel`) and partners
 * (`partnershipModel`) because the shared mechanism was never changed.
 *
 * So the manifest now answers the contract question rather than the database
 * one. The mapping is read out of `platform-runtime.service.ts` itself rather
 * than copied here, for the reason `platform-runtime.dto-contract.spec.ts`
 * gives: a module wired up later is covered without anyone remembering to
 * update this file.
 */

/** `import { A, B } from './x.dto'` → { A: '<abs>/x.dto.ts', B: ... }. */
function readDtoImports(source, fromFile) {
  const map = new Map();
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g;
  let match;
  while ((match = importRe.exec(source))) {
    const [, names, specifier] = match;
    if (!specifier.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(fromFile), specifier) + ".ts";
    for (const raw of names.split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (name) map.set(name, resolved);
    }
  }
  return map;
}

/**
 * Body of `async <name>(` up to the matching close brace.
 *
 * Counting braces rather than regex-matching the whole method: the switch
 * arms contain object literals and template strings, and a lazy match stops
 * at the first `}` inside one of them.
 */
function readMethodBody(source, name) {
  const start = source.search(new RegExp(`\\basync\\s+${name}\\s*\\(`));
  if (start === -1) return null;
  const open = source.indexOf("{", source.indexOf(")", start));
  if (open === -1) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return null;
}

/** `case 'leads': ... dto(CreateAdminLeadDto, …)` → { leads: 'CreateAdminLeadDto' }. */
function readCaseDtos(body) {
  const result = {};
  if (!body) return result;
  const caseRe = /case\s+'([\w-]+)'\s*:/g;
  const marks = [];
  let match;
  while ((match = caseRe.exec(body)))
    marks.push({ key: match[1], at: match.index });
  for (let index = 0; index < marks.length; index += 1) {
    const slice = body.slice(
      marks[index].at,
      index + 1 < marks.length ? marks[index + 1].at : body.length,
    );
    const dtoMatch = slice.match(/\bdto\(\s*(\w+)\s*,/);
    if (dtoMatch) result[marks[index].key] = dtoMatch[1];
  }
  return result;
}

/*
 * Remove any `@Decorator(...)` prefixes from a line.
 *
 * This codebase writes short validators inline — `@IsString() @MaxLength(160)
 * displayName!: string;` — so skipping lines that begin with `@` skips the
 * property too. Arguments are consumed by counting parens rather than by a
 * lazy `\([^)]*\)`, because `@Type(() => Number)` nests them.
 */
function stripLeadingDecorators(line) {
  let rest = line;
  while (rest.startsWith("@")) {
    let index = 1;
    while (index < rest.length && /[\w.]/.test(rest[index])) index += 1;
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

/**
 * Property names a DTO class declares, following `extends` within its file.
 *
 * Only top-level members count. A decorator argument or a nested object type
 * can contain something that looks like `name?: string`, so depth is tracked
 * and anything inside a brace, bracket or paren is skipped.
 */
function readClassProperties(file, className, seen = new Set()) {
  const marker = `${file}#${className}`;
  if (seen.has(marker)) return new Set();
  seen.add(marker);

  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return new Set();
  }

  const declaration = new RegExp(
    `export\\s+class\\s+${className}\\b([^{]*)\\{`,
  ).exec(source);
  if (!declaration) return new Set();

  const open = declaration.index + declaration[0].length - 1;
  let depth = 0;
  let end = source.length;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const body = source.slice(open + 1, end);

  const properties = new Set();
  let nesting = 0;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripLeadingDecorators(rawLine.trim());
    if (nesting === 0 && !line.startsWith("//")) {
      const property = line.match(/^(?:readonly\s+)?([A-Za-z_]\w*)\s*[?!]?\s*:/);
      if (property) properties.add(property[1]);
    }
    for (const character of rawLine) {
      if ("{[(".includes(character)) nesting += 1;
      else if ("}])".includes(character)) nesting -= 1;
    }
    if (nesting < 0) nesting = 0;
  }

  // `UpdatePartnerDto extends CreatePartnerDto {}` — inherit the base's fields.
  const base = declaration[1].match(/extends\s+(\w+)/);
  if (base) {
    const imports = readDtoImports(source, file);
    for (const inherited of readClassProperties(
      imports.get(base[1]) ?? file,
      base[1],
      seen,
    ))
      properties.add(inherited);
  }
  return properties;
}

/**
 * Per-module sets of the field names the runtime's create and update DTOs
 * declare. A module absent from a switch has no such route at all, and is
 * reported as `null` so the caller can tell "declares nothing" from
 * "cannot be written through the runtime".
 */
export function readRuntimeWriteContract(serviceFile) {
  const source = readFileSync(serviceFile, "utf8");
  const imports = readDtoImports(source, serviceFile);
  const create = readCaseDtos(readMethodBody(source, "create"));
  const update = readCaseDtos(readMethodBody(source, "update"));

  const resolve = (dtoName) =>
    dtoName && imports.has(dtoName)
      ? readClassProperties(imports.get(dtoName), dtoName)
      : null;

  const contract = {};
  for (const moduleKey of new Set([
    ...Object.keys(create),
    ...Object.keys(update),
  ]))
    contract[moduleKey] = {
      createDto: create[moduleKey] ?? null,
      updateDto: update[moduleKey] ?? null,
      creatable: resolve(create[moduleKey]),
      editable: resolve(update[moduleKey]),
    };
  return contract;
}
