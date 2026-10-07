import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readDtoClassProperties,
  readExtendsExpression,
  readRuntimeWriteContract,
} from "./lib/runtime-write-contract.mjs";

/*
 * EXECPLAN-0055 D2. The generator read `extends\s+(\w+)`, which on
 * `UpdatePartnerDto extends PartialType(CreatePartnerDto)` captured
 * `PartialType`, found no such class and declared zero partner fields
 * editable — so the admin's Save sent `values: {}` and reported success.
 * These cases pin each mapped-type wrapper the API uses or could use, against
 * fixture DTOs, so a regression fails here rather than as a silent no-op save.
 */

const fixtures = mkdtempSync(path.join(tmpdir(), "write-contract-"));
test.after(() => rmSync(fixtures, { recursive: true, force: true }));

writeFileSync(
  path.join(fixtures, "base.dto.ts"),
  [
    "import { IsString } from 'class-validator';",
    "export class BaseDto {",
    "  @IsString() name!: string;",
    "  @IsString() email!: string;",
    "  @IsString() status?: string;",
    "  @IsString() notes?: string;",
    "}",
    "export class ExtraDto {",
    "  @IsString() extra?: string;",
    "}",
    "",
  ].join("\n"),
);
writeFileSync(
  path.join(fixtures, "wrappers.dto.ts"),
  [
    "import { OmitType, PartialType, PickType, IntersectionType } from '@nestjs/mapped-types';",
    'import { BaseDto, ExtraDto } from "./base.dto";',
    "export class PlainDto extends BaseDto {",
    "  @IsString() own?: string;",
    "}",
    "export class PartialDto extends PartialType(BaseDto) {}",
    "export class OmitDto extends OmitType(BaseDto, ['status', 'notes'] as const) {}",
    "export class PickDto extends PickType(BaseDto, ['name'] as const) {}",
    "export class IntersectDto extends IntersectionType(BaseDto, ExtraDto) {}",
    "export class NestedDto extends PartialType(",
    "  OmitType(BaseDto, ['status'] as const),",
    ") {}",
    "export class DeepDto extends PartialType(IntersectionType(PickType(BaseDto, ['email']), ExtraDto)) implements Marker {}",
    "export class UnknownWrapperDto extends SomeOtherType(BaseDto) {}",
    "",
  ].join("\n"),
);

const fieldsOf = (className) =>
  [...readDtoClassProperties(path.join(fixtures, "wrappers.dto.ts"), className)].sort();

test("plain extends inherits the base and keeps its own fields", () => {
  assert.deepEqual(fieldsOf("PlainDto"), ["email", "name", "notes", "own", "status"]);
});

test("PartialType(X) has every field of X", () => {
  assert.deepEqual(fieldsOf("PartialDto"), ["email", "name", "notes", "status"]);
});

test("OmitType(X, keys) drops exactly the omitted keys", () => {
  assert.deepEqual(fieldsOf("OmitDto"), ["email", "name"]);
});

test("PickType(X, keys) keeps only the picked keys", () => {
  assert.deepEqual(fieldsOf("PickDto"), ["name"]);
});

test("IntersectionType(A, B) is the union", () => {
  assert.deepEqual(fieldsOf("IntersectDto"), ["email", "extra", "name", "notes", "status"]);
});

test("wrappers nest, across lines", () => {
  assert.deepEqual(fieldsOf("NestedDto"), ["email", "name", "notes"]);
  assert.deepEqual(fieldsOf("DeepDto"), ["email", "extra"]);
});

test("an unknown wrapper contributes nothing rather than guessing", () => {
  assert.deepEqual(fieldsOf("UnknownWrapperDto"), []);
});

test("the heritage expression stops at implements", () => {
  assert.equal(
    readExtendsExpression(" extends PartialType(A) implements B, C "),
    "PartialType(A)",
  );
  assert.equal(readExtendsExpression(" implements B "), null);
});

test("the real partner update DTO resolves to the create DTO's fields", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const contract = readRuntimeWriteContract(
    path.join(
      root,
      "services/api/src/modules/platform-runtime/platform-runtime.service.ts",
    ),
  );
  const { creatable, editable, updateDto } = contract.partners;
  assert.equal(updateDto, "UpdatePartnerDto");
  // Non-vacuous: the set that used to be empty.
  assert.ok(editable.has("displayName"), "displayName must be editable");
  assert.ok(editable.size >= 10, `only ${editable.size} editable partner fields`);
  assert.deepEqual([...editable].sort(), [...creatable].sort());
  for (const forbidden of ["status", "accountStatus", "partnerNumber", "code"])
    assert.equal(editable.has(forbidden), false, `${forbidden} must not be editable`);
});
