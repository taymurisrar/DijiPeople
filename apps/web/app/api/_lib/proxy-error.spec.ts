import { ApiRequestError } from "@/lib/server-api";
import { proxyErrorResponse } from "./proxy-error";

/**
 * REG-211 — ITEM-0035.
 *
 * 134 catch blocks across 123 handlers answered every upstream failure with a
 * hardcoded 500. The invariant: **a refusal from the API arrives at the browser
 * as what it was**, with its status, its `errorCode`, its `traceId` and its
 * `fieldErrors` — and a genuine crash in the handler is still a 500, because
 * that is what it is.
 */
describe("proxyErrorResponse", () => {
  function apiError(overrides: Partial<ConstructorParameters<typeof ApiRequestError>[0]> = {}) {
    return new ApiRequestError({
      status: 422,
      message: "Validation failed.",
      traceId: "trace-1",
      ...overrides,
    });
  }

  async function read(response: Response) {
    return { status: response.status, body: await response.json() };
  }

  it("forwards the upstream status rather than flattening it", async () => {
    for (const status of [400, 403, 404, 409, 422, 429, 503]) {
      const response = proxyErrorResponse(apiError({ status }), "fallback");
      expect(response.status).toBe(status);
    }
  });

  it("carries the traceId, so a reported error can be found in the log", async () => {
    const { body } = await read(proxyErrorResponse(apiError(), "fallback"));
    expect(body.traceId).toBe("trace-1");
  });

  it("carries the errorCode when the API sent one", async () => {
    const error = apiError();
    error.errorCode = "EMPLOYEE_CODE_TAKEN";
    const { body } = await read(proxyErrorResponse(error, "fallback"));
    expect(body.errorCode).toBe("EMPLOYEE_CODE_TAKEN");
  });

  it("carries fieldErrors, so a form can highlight the field", async () => {
    const error = apiError();
    error.body = { fieldErrors: { workEmail: ["Already in use."] } } as never;
    const { body } = await read(proxyErrorResponse(error, "fallback"));
    expect(body.fieldErrors).toEqual({ workEmail: ["Already in use."] });
  });

  it("omits keys the API did not send, rather than sending undefined", async () => {
    const error = new ApiRequestError({ status: 404, message: "Not found." });
    const { body } = await read(proxyErrorResponse(error, "fallback"));
    expect(body).not.toHaveProperty("errorCode");
    expect(body).not.toHaveProperty("traceId");
    expect(body).not.toHaveProperty("fieldErrors");
  });

  it("uses the API's message, not the fallback, when the API spoke", async () => {
    const { body } = await read(proxyErrorResponse(apiError(), "Unable to save."));
    expect(body.message).toBe("Validation failed.");
  });

  it("falls back when the API sent an empty message", async () => {
    const error = apiError({ message: "" });
    const { body } = await read(proxyErrorResponse(error, "Unable to save."));
    expect(body.message).toBe("Unable to save.");
  });

  it("still 500s a genuine crash in the handler", async () => {
    // The distinction the flattened form erased: "the API refused" versus
    // "this handler broke". Only the second is a server error.
    const { status, body } = await read(
      proxyErrorResponse(new TypeError("x is not a function"), "Unable to save."),
    );
    expect(status).toBe(500);
    expect(body.message).toBe("x is not a function");
  });

  it("uses the fallback for a thrown non-Error", async () => {
    const { status, body } = await read(proxyErrorResponse("oops", "Unable to save."));
    expect(status).toBe(500);
    expect(body.message).toBe("Unable to save.");
  });

  it("marks every failure as unsuccessful", async () => {
    const { body } = await read(proxyErrorResponse(apiError(), "fallback"));
    expect(body.success).toBe(false);
  });

  it("ignores a fieldErrors that is not an object", async () => {
    const error = apiError();
    error.body = { fieldErrors: "nope" } as never;
    const { body } = await read(proxyErrorResponse(error, "fallback"));
    expect(body).not.toHaveProperty("fieldErrors");
  });
});
