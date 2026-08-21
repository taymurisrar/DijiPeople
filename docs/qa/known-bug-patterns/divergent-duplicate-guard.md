# Bug pattern — `divergent-duplicate-guard`

**One invariant, expressed in two places, that drift apart.**

Related to [`duplicate-route-bypass`](duplicate-route-bypass.md), but the
duplication is not two routes — it is two *copies of the rule*. One copy gets
updated when the domain grows and the other does not, and the stale copy is
usually the one on the path an attacker or a careless operator actually takes.

## What it looks like

A shared guard exists and is correct:

```ts
private assertAgreementEditable(status: string) {
  if (['SENT','VIEWED','SIGNATURE_IN_PROGRESS','PARTIALLY_SIGNED','FULLY_SIGNED',
       'FULLY_EXECUTED','ACTIVE','SUPERSEDED','TERMINATED','ARCHIVED'].includes(status))
    throw new BadRequestException('… immutable after signing begins.');
}
```

…and somewhere else the same rule is re-typed inline, with fewer entries:

```ts
if (['SIGNATURE_IN_PROGRESS','PARTIALLY_SIGNED','FULLY_SIGNED','ACTIVE','ARCHIVED']
      .includes(existing.status)) { throw … }   // SENT, VIEWED, FULLY_EXECUTED missing
```

Both compile. Both look like the rule. Only one is enforced on the write path.

## Why it is dangerous here

DijiPeople's commercial gates are *queries*, not flags. Lead conversion asks
"does an executed contract exist whose `relatedLeadId` is this lead?"; tenant
provisioning asks a similar question of the customer. So any code that can
mutate `relatedLeadId`, `customerAccountId`, `contractType` or the contract
status **is** the gate, whether or not it looks like authorization.

In REG-009 a single `PATCH /contracts/:id` re-pointed a fully executed,
counter-signed agreement at a different company's lead, and that lead — which had
never signed anything — converted into a real `CustomerAccount`. Nothing in the
audit trail distinguishes it from a legitimate conversion.

## How to detect it

- Grep for the same enum-value list appearing in more than one file or method.
  Status lists, role lists and permission-key lists are the usual carriers.
- When a guard exists as a named private method, check **every** mutating entry
  point actually calls it. `grep -n "assertX" service.ts` and compare against the
  list of public mutating methods.
- Ask of each gate: *what columns does it read?* Then ask *what can write those
  columns?* If a write path is not covered by the guard, that is the hole.

## How to prevent it

- One list, one place. Delegate to the shared guard rather than re-typing it —
  the diff that removed the inline copy in REG-009 was net-negative in lines.
- Test the **entry point**, not the guard. A test that exercises
  `assertAgreementEditable` directly passes against the unfixed code and proves
  nothing; the regression test must drive `update()` and assert no write
  occurred.
- When adding a status to an enum, search for existing lists of that enum's
  values before assuming one place needs updating.

## Occurrences

| Ref | Where |
|---|---|
| REG-009 | `ContractsService.update()` vs `assertAgreementEditable` |
| REG-179 | `apps/admin/lib/tenant-url.ts` vs `buildWorkspaceUrl` in `packages/config` |
| REG-184 | `PublicTenantsService.getTenantSlugFromHost` vs `parseWorkspaceHostname` |

### The lesson REG-184 adds

REG-179 consolidated the copy that **built** workspace links, verified the link
it produced, and closed. REG-184 is the copy that **read** them — a third
implementation of the same rule, keyed on a third name for its input
(`TENANT_BASE_DOMAIN`, `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`,
`WEB_APP_PROD_ROOT_DOMAIN`). Each copy was internally correct. Configuring the
platform correctly for two of them left the third inert, and an inert hostname
parser fails closed: a customer could not log in, and the API answered
`TENANT_NOT_FOUND` for a tenant that plainly existed.

So: **when a duplicated rule is consolidated, enumerate every *reader* of the
concept, not only the writer that was reported.** The report names the symptom
somebody noticed. The duplication is a property of the concept, and the second
symptom is usually somewhere nobody was looking.

A practical way to enumerate: search for every environment variable name that
could plausibly express the same concept, not only the one the shared rule uses.
Three names for one value is what hid this for two rounds.
