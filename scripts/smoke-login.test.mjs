import assert from "node:assert/strict";
import test from "node:test";
import { loginBody } from "./smoke-login.mjs";

test("the login body carries the tenant slug, normalised, beside the credentials", () => {
  const body = JSON.parse(
    loginBody({ email: "a@b.test", password: "x" }, " Qa-Prov-A ", { rememberMe: false }),
  );
  assert.deepEqual(body, { email: "a@b.test", password: "x", rememberMe: false, tenantSlug: "qa-prov-a" });
});

test("a missing or blank slug fails with a message naming the variable", () => {
  for (const slug of [undefined, "", "   ", null]) {
    assert.throws(() => loginBody({ email: "a@b.test", password: "x" }, slug), /SMOKE_TENANT_SLUG/);
  }
});

test("extra fields cannot override the tenant slug", () => {
  const body = JSON.parse(loginBody({ email: "a@b.test", password: "x" }, "real", { tenantSlug: "evil" }));
  assert.equal(body.tenantSlug, "real");
});
