# Bug Pattern — Silent Config Fallback

## Pattern
Code reads a configuration value and ends the chain in a hardcoded
development-shaped literal:

```ts
const target = process.env.SOME_URL || "http://localhost:3001";
```

A missing production value does not fail. It becomes a **plausible wrong
answer** that builds cleanly, reviews cleanly, and is only discovered by a
customer.

## Why it happens in DijiPeople
Three properties of this repository combine:

1. **Next.js inlines `NEXT_PUBLIC_*` at build time.** A variable absent from the
   build environment is baked in as `undefined`, so the fallback becomes a
   literal in shipped HTML. There is no runtime moment at which it could fail.
2. **`isProductionLike()` is deliberately narrow** — `APP_ENV`/`VERCEL`/`RENDER`,
   not `NODE_ENV` — so a guard written as "throw in production" is disarmed on
   any host that does not set one of those.
3. **The correct helper already existed and was bypassed.** `getAppOrigin()`
   throws in production; every defective call site re-derived the origin itself
   rather than calling it. A shared helper only helps if nothing routes around
   it.

## Example architecture area
[[BUG-0026]] — the public "Login" button on the marketing site pointed at
`http://localhost:3001/dashboard` in production. Seven call sites carried the
pattern across `apps/landing`, `apps/web`, `apps/admin` and `services/api`;
`validateDeploymentEnv` required none of the variables, so nothing forced them
to be set. The same class put loopback URLs into tenant activation and
invitation **emails**.

Two aggravating variants appeared in the same defect:

- **A phantom variable.** `NEXT_PUBLIC_APP_PORTAL_URL` was consulted before the
  literal but is defined nowhere in the repository — not in `turbo.json`
  `globalEnv`, not in any `.env*.example`, not in the docs. A fallback chain
  that reads plausibly can be entirely dead.
- **A pure literal.** `apps/web/.../partner-login-form.tsx` hardcoded
  `http://localhost:3000/partners` with no environment variable at all, so no
  amount of environment validation could ever have caught it.

## Detection checklist
- Grep shipped source for `|| "http://localhost`, `?? "http://localhost`, and
  bare `http://localhost` / `127.0.0.1` literals.
- For each fallback chain: does **every** variable in it exist in `turbo.json`
  `globalEnv` and at least one `.env*.example`? A name nobody registered is
  always `undefined`.
- Does a shared resolver already exist that this call site is routing around?
- Is the value required by startup/build validation, or merely read?
- For Next.js: is the value needed in a **client** component? Then it is inlined
  at build time and must be present in the *build* environment, not the runtime
  one.

## Required regression test
Two, because they catch different halves:

1. **Validation test** — a production-like environment missing the value, or
   holding a loopback/malformed one, must fail. Prove it fails against the
   unfixed code.
2. **Source check** — a repository-wide scan rejecting loopback literals in
   shipped source, with an explicit allowlist carrying a reason per entry. A
   literal never consults a variable, so validation alone cannot see it.

`packages/config/app-urls.test.js` and `scripts/check-no-hardcoded-urls.mjs`
are the reference implementations; both run in CI.

## Agent responsible
Integration / Release-DevOps, with the owning frontend or backend agent.

## Reviewer check
When a diff adds or edits a configuration read, ask what happens in production
when the value is absent. "It falls back" is the defect, not the mitigation.
The acceptable answers are "the build fails" or "the process refuses to start".

## QA check
Build the affected app in a production-like environment (`VERCEL=1` or
`APP_ENV=production`) with the variable removed, and assert the build **fails**.
Then build it configured and grep the built output for the expected value and
for any surviving loopback literal.

## Prevention rule
A loopback address is a development answer. In production it is a configuration
error, raised at build or boot — never a fallback. Resolve shared values through
one helper that fails loudly, and make routing around that helper mechanically
detectable.
