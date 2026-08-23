import { readFileSync } from "node:fs";
import { join } from "node:path";

const DTO_DIR = join(
  __dirname,
  "../../../../services/api/src/modules/super-admin/dto",
);
const MANAGER = join(
  __dirname,
  "../../app/_components/plan-price-manager.tsx",
);

/**
 * What `PlanPriceManager` sends, against what the endpoints accept.
 *
 * The global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so a
 * property the DTO does not declare is a **400 on the whole request**, not an
 * ignored extra. Payload and DTO therefore have to move together, and nothing
 * in the type system connects a `JSON.stringify` in a React component to a
 * class-validator DTO in another workspace.
 *
 * `plan-record-form.spec.ts` already makes this assertion for the plan *record*
 * form. There was no equivalent for the *price* form, and the gap cost exactly
 * what it was always going to cost: `toPayload` was shared between create and
 * update and included `syncToStripe`, which `CreatePlanPriceDto` declares and
 * `UpdatePlanPriceDto` does not. Creating a price worked; editing one returned
 * `property syncToStripe should not exist` every single time.
 *
 * That defect was reachable only once the Pricing tab was restored — before
 * that the whole panel was behind a tab the tab bar filtered out, so nobody
 * could get far enough to hit it. Making a screen reachable is what makes its
 * bugs reachable too, which is the argument for this file existing.
 *
 * Assertions are written against the DTO sources rather than a list repeated
 * here, so adding a property to a DTO opens it to the form, and removing one
 * fails here rather than in a browser.
 */
describe("plan price payloads match the DTOs that receive them", () => {
  const manager = readFileSync(MANAGER, "utf8");

  /** Property names a DTO class declares, e.g. `unitAmount?: number;`. */
  function dtoProperties(file: string) {
    const source = readFileSync(join(DTO_DIR, file), "utf8");
    return {
      source,
      /*
       * `[!?]?` covers all three declaration forms these DTOs use: optional
       * (`minimumSeats?: number`), definite-assignment (`currency!: string`)
       * and plain. Matching only `?:` silently missed every required property,
       * which would have made this suite reject `currency` and `unitAmount` —
       * fields the endpoint very much does accept.
       */
      properties: new Set(
        [...source.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)[!?]?:/gm)].map(
          (match) => match[1]!,
        ),
      ),
    };
  }

  /**
   * Property names a named payload function puts on the wire.
   *
   * Reads from the opening brace of the body rather than the declaration, so
   * the parameter's own type annotation (`draft: DraftPrice`) is not mistaken
   * for a payload key. Matches both the multi-line object literal and the
   * single-line spread form (`{ ...toBasePayload(draft), syncToStripe: true }`).
   */
  function payloadKeys(functionName: string) {
    const declaration = manager.indexOf(`function ${functionName}(`);
    expect([functionName, declaration]).not.toEqual([functionName, -1]);
    const bodyStart = manager.indexOf("{", manager.indexOf(")", declaration));
    const body = manager.slice(bodyStart, manager.indexOf("\n}", bodyStart));
    return new Set(
      [...body.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map(
        (match) => match[1]!,
      ),
    );
  }

  const create = dtoProperties("create-plan-price.dto.ts");
  const update = dtoProperties("update-plan-price.dto.ts");

  it("reads the DTOs it is asserting against", () => {
    // A moved or renamed file would otherwise make every case below pass over
    // an empty set.
    expect(create.source).toContain("export class CreatePlanPriceDto");
    expect(update.source).toContain("export class UpdatePlanPriceDto");
    expect(create.properties.has("unitAmount")).toBe(true);
    expect(update.properties.has("unitAmount")).toBe(true);
  });

  it("sends the create endpoint only properties CreatePlanPriceDto declares", () => {
    const sent = [...payloadKeys("toCreatePayload"), ...payloadKeys("toBasePayload")];
    expect(sent.length).toBeGreaterThan(0);
    const rejected = sent.filter((key) => !create.properties.has(key));
    expect(rejected).toEqual([]);
  });

  it("sends the update endpoint only properties UpdatePlanPriceDto declares", () => {
    /*
     * The regression. `syncToStripe` is declared by the create DTO and not the
     * update one, so a shared payload 400s on every edit.
     */
    const sent = [...payloadKeys("toUpdatePayload"), ...payloadKeys("toBasePayload")];
    expect(sent.length).toBeGreaterThan(0);
    const rejected = sent.filter((key) => !update.properties.has(key));
    expect(rejected).toEqual([]);
  });

  it("keeps syncToStripe off the update payload specifically", () => {
    /*
     * Named rather than left to the generic case, because the reason it is safe
     * to omit is not obvious: a Stripe price is immutable, so `updatePlanPrice`
     * supersedes the row by calling `createPlanPrice` with `syncToStripe: true`
     * hardcoded whenever amount, currency, interval or billing model changes.
     * The sync is already guaranteed on exactly the edits that need one.
     */
    expect(update.properties.has("syncToStripe")).toBe(false);
    expect([...payloadKeys("toUpdatePayload")]).not.toContain("syncToStripe");
    expect([...payloadKeys("toBasePayload")]).not.toContain("syncToStripe");
    expect([...payloadKeys("toCreatePayload")]).toContain("syncToStripe");
  });
});
