# Bug pattern — `declared-but-unwired-step`

**A capability is declared as data in one file and implemented as a branch in
another, with nothing tying the two together.**

The sibling of [`defined-but-unwired-permission`](defined-but-unwired-permission.md).
There, a permission key exists but no role holds it. Here, a step, action or
handler key exists in a catalogue but no implementation answers to it — and the
gap only shows up on the recovery path, which is exactly when it hurts most.

## What it looks like

A catalogue declares intent:

```ts
export const TENANT_PROVISIONING_STEPS = [
  { key: 'workspace-slug-reserved',    isRetryable: true },   // new
  { key: 'workspace-routing-verified', isRetryable: true },   // new
  …
];
```

An unrelated file implements it as a chain of `if`s ending in a throw:

```ts
if (key === 'workspace-domain')          { … return; }
if (key === 'rbac-defaults')             { … return; }
if (key === 'customization-defaults')    { … return; }
if (key === 'invitations')               { return; }
throw new Error(`Step ${key} cannot be replayed automatically.`);
```

Adding to the catalogue is a one-line change and feels complete. Nothing fails
to compile. Nothing fails at provisioning time either, because the forward path
runs the step inline — only the *retry* path dispatches by key.

## Why it is dangerous

The unwired branch sits on the recovery path, so it is invisible until something
else has already gone wrong. In REG-012 the two new steps were the *first* two
retryable steps in catalogue order, so **every** retry died immediately: any
tenant that failed provisioning became permanently unrecoverable, while the
admin UI kept offering a "Retry provisioning" button that could never succeed.

Worse, once the dispatch gap was fixed, retry began reporting SUCCEEDED for a
tenant that still could not be activated (a separate defect) — a green result
that overstates what was recovered.

## How to detect it

- For any `key`-dispatched switch or `if` chain, write a test that iterates the
  **catalogue** and asserts each key is handled. The catalogue is the spec; the
  switch is the implementation; the test is the link.
- Grep for fallthrough throws (`cannot be replayed`, `Unsupported`, `Unknown
  action`) and ask which enumeration is supposed to be exhaustive against them.
- Exercise recovery paths in QA, not just happy paths. Failure injection found
  this; no amount of successful provisioning would have.

## How to prevent it

- Pin the catalogue and the dispatcher together in a colocated spec (see
  `tenant-provisioning-retry.spec.ts`), including the specific keys whose
  absence caused the incident, so removing them from the catalogue cannot make
  the suite green by omission.
- Prefer a typed record keyed by the catalogue's key union over an `if` chain,
  so an unimplemented key is a compile error rather than a runtime throw.

## Occurrences

| Ref | Where |
|---|---|
| REG-012 | `TENANT_PROVISIONING_STEPS` vs `TenantOperationsService.runRetryableStep` |
