/*
 * BUG-2013 — the boundary classified server-component failures by a message it
 * can never receive. The first test below is the one that failed before the
 * fix: it feeds the classifier the literal React production placeholder and
 * asserts a deliberate server-failure verdict rather than the accidental
 * fall-through to "unexpected".
 */
import {
  classifyDashboardError,
  isServerComponentPlaceholder,
} from "./classify-dashboard-error";

/* Verbatim, as React's `resolveErrorProd()` builds it in a production build. */
const REACT_441_MESSAGE =
  "Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";

/* The same error, spelled out, as the un-minified build words it. */
const REACT_441_UNMINIFIED =
  "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.";

describe("classifyDashboardError", () => {
  describe("server component failures", () => {
    it("classifies the minified React #441 placeholder as a server error", () => {
      const config = classifyDashboardError({
        message: REACT_441_MESSAGE,
        digest: "2951983503",
      });

      expect(config.variant).toBe("server-error");
      expect(config.variant).not.toBe("unexpected");
    });

    it("classifies the un-minified placeholder the same way", () => {
      expect(
        classifyDashboardError({ message: REACT_441_UNMINIFIED }).variant,
      ).toBe("server-error");
    });

    it("recognises the placeholder in both forms", () => {
      expect(isServerComponentPlaceholder(REACT_441_MESSAGE)).toBe(true);
      expect(isServerComponentPlaceholder(REACT_441_UNMINIFIED)).toBe(true);
      expect(isServerComponentPlaceholder("Failed to fetch")).toBe(false);
      expect(isServerComponentPlaceholder("")).toBe(false);
    });

    it("tells the user to quote a reference rather than guessing the cause", () => {
      const config = classifyDashboardError({
        message: REACT_441_MESSAGE,
        digest: "2836191299",
      });

      expect(config.description.toLowerCase()).toContain("reference");
      /* It must not claim a cause it cannot know. */
      expect(config.eyebrow).not.toBe("Access denied");
      expect(config.eyebrow).not.toBe("Record not found");
    });
  });

  describe("an explicit HTTP status wins over the message text", () => {
    it("does not render a 404 as ACCESS DENIED, even when the message says permission", () => {
      const config = classifyDashboardError({
        status: 404,
        message: "You do not have permission to read this user record.",
      });

      expect(config.variant).toBe("not-found");
      expect(config.eyebrow).not.toBe("Access denied");
    });

    it("classifies 401 as an expired session and sends the user to sign in", () => {
      const config = classifyDashboardError({ status: 401, message: "nope" });
      expect(config.variant).toBe("session-expired");
      expect(config.primaryAction).toBe("login");
    });

    it("classifies 403 as access denied", () => {
      expect(classifyDashboardError({ status: 403 }).variant).toBe(
        "access-denied",
      );
    });

    it("classifies 5xx as a service failure", () => {
      for (const status of [500, 502, 503, 504]) {
        expect(classifyDashboardError({ status }).variant).toBe("api-error");
      }
    });

    it("reads statusCode when status is absent", () => {
      expect(classifyDashboardError({ statusCode: 403 }).variant).toBe(
        "access-denied",
      );
    });
  });

  describe("client-originated failures still classify by message", () => {
    it("keeps the four message branches reachable", () => {
      expect(
        classifyDashboardError({ message: "jwt expired" }).variant,
      ).toBe("session-expired");
      expect(
        classifyDashboardError({ message: "Access denied" }).variant,
      ).toBe("access-denied");
      expect(
        classifyDashboardError({ message: "Record not found" }).variant,
      ).toBe("not-found");
      expect(
        classifyDashboardError({ message: "Failed to fetch" }).variant,
      ).toBe("api-error");
    });

    it("classifies by error code when there is no status", () => {
      expect(classifyDashboardError({ code: "FORBIDDEN" }).variant).toBe(
        "access-denied",
      );
      expect(
        classifyDashboardError({ code: "DATABASE_RECORD_NOT_FOUND" }).variant,
      ).toBe("not-found");
    });

    it("does not treat every message containing the letters 'api' as an outage", () => {
      /*
       * The old branch matched `message.includes("api")`, so "rapid",
       * "capital" and any message quoting an /api/ URL became a service
       * outage. The fall-through has to stay reachable.
       */
      expect(
        classifyDashboardError({ message: "Rapid capital adjustment failed" })
          .variant,
      ).toBe("unexpected");
    });

    it("falls through to unexpected for a message it cannot read", () => {
      expect(classifyDashboardError({ message: "something odd" }).variant).toBe(
        "unexpected",
      );
      expect(classifyDashboardError({}).variant).toBe("unexpected");
    });
  });
});
