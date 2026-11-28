import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Each screen calls its API through a thin same-origin proxy that forwards one HTTP
 * method per exported handler. A method the screen uses but the proxy does not
 * export answers 405 in the browser while the API itself would have accepted it
 * (scoped daily-update policies could not be deleted for exactly that reason), and
 * no unit test of the screen's own logic sees it. So the methods are pinned here.
 */
const API_ROUTES = path.resolve(__dirname, "../../../api");

function exportedMethods(resource: string): string[] {
  const source = readFileSync(
    path.join(API_ROUTES, resource, "[[...path]]", "route.ts"),
    "utf8",
  );
  return [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
    (m) => m[1],
  );
}

const NEEDED: Record<string, string[]> = {
  // GET/PUT policies, DELETE a scoped policy, POST escalation and updates.
  "daily-updates": ["GET", "POST", "PUT", "DELETE"],
  // GET, POST create/hold/cancel/attendance, PATCH edit.
  "work-meetings": ["GET", "POST", "PATCH"],
  // GET, POST create/decide/supersede/reverse/actions.
  "work-decisions": ["GET", "POST"],
};

describe("work proxies export every method their screens use", () => {
  for (const [resource, methods] of Object.entries(NEEDED)) {
    it(`/api/${resource}`, () => {
      expect(exportedMethods(resource)).toEqual(expect.arrayContaining(methods));
    });
  }
});
