import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Found by the browser pass in DP-MASTER WP-26.S3: this is a SERVER component
 * (it has no "use client"), and it imported formatDateTime from
 * notification-ui, a "use client" module. A server component cannot call a
 * function exported from a client module, so the Run History page crashed with
 * "Attempted to call formatDateTime() from the server" as soon as a workflow had
 * a single run. No unit test renders across the server/client boundary, so this
 * pins the cause: the formatter must come from the shared, boundary-free
 * formatting module.
 */
const source = readFileSync(
  join(__dirname, "workflow-run-history.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("workflow-run-history (server component)", () => {
  it("is a server component", () => {
    expect(source.startsWith('"use client"')).toBe(false);
  });

  it("takes formatDateTime from the shared formatting module, not a client module", () => {
    expect(source).toMatch(
      /import \{ formatDateTime \} from "@\/lib\/formatting-context";/,
    );
    const clientImport = /import \{([^}]*)\} from "[^"]*notification-ui";/.exec(
      source,
    );
    expect(clientImport).not.toBeNull();
    expect(clientImport?.[1]).not.toMatch(/formatDateTime/);
  });
});
