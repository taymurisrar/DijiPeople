# Bug pattern — `container-saved-before-its-contents`

**A container is saved at the moment its parent is created, before any of the
things it is meant to hold exist. Nothing adds them later, and the consumer
honours the empty container because it is well formed.**

The empty container is not malformed, so validators pass it. It is not missing,
so fallbacks never trigger. It is simply a correct, saved, published object that
contains nothing — and the screen built from it is a card with a Save button and
no fields.

## What it looks like

Creating a custom table saves its default main form in the same call, from the
columns that exist at that instant — none:

```ts
const form = await this.prisma.customizationForm.create({
  data: {
    formKey: 'main',
    layoutJson: buildDefaultFormLayout(table, []),   // tabs → sections → fields: []
  },
});
```

Columns are added afterwards, one request each. None of those requests touches
the form. The runtime then accepts the saved layout because its *shape* is
right:

```ts
const sane = tabs.every((tab) => Array.isArray(tab.sections) &&
  tab.sections.every((section) => Array.isArray(section.fields)));   // [] passes
return sane ? layout : null;
```

and a published form, however empty, replaces the generated form that would
have listed every published field.

## Why it is dangerous here

The order that produces it is the documented one: create the module, add its
fields, publish. So it is not an edge case — it is what every tenant building a
custom module will do first.

It also hides from every test written at the wrong level. The DB-backed
custom-module e2e created records through the API and passed 8 of 8; the unit
specs mapped a form that already had placements. Only opening **New** in a
browser, on a module built in that order, showed a blank create screen
(TASK-0031, local browser QA).

## How to detect it

- Find every `create` that writes a child alongside its parent — default forms,
  default views, default packages, default role sets — and ask what it is built
  from, and whether that input can be empty at that moment.
- For each, find what adds the later contents (a column, a field, a member).
  If nothing writes back into the container, it stays as it was saved.
- In QA, build the thing in the order a user would, then use the *consumer*
  (the screen, the export, the API client), not the store.

## How to prevent it

Make the consumer treat "well formed but empty" as absent, so the existing
fallback applies:

```ts
const sections = mapped.sections
  .map((section) => ({ ...section, fields: section.fields.filter(isKnown) }))
  .filter((section) => section.fields.length > 0);
return sections.length > 0 ? [{ ...mapped, sections }] : [];
```

and pin it with a test that starts from the empty container the create path
really writes, not from a hand-built populated one. Placing new contents into
the container on write is the other half; decide it deliberately, because it
changes what a designer-authored layout means.

## Records

REG ids are entries in one register file rather than notes of their own, so
they are named in plain text here.

- [[BUG-3494-a-published-custom-module-has-no-sidebar-entry-and-no-list-f]] — the
  published custom module whose create screen rendered no fields; fixed in
  `22511c32`, covered by two `custom-module-runtime.spec.ts` cases under REG-492
- [[TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz]] — the
  program whose browser QA found it

## Related patterns

- [`silent-degradation`](silent-degradation.md) — a degraded result presented as
  a normal one
- [`assertion-without-a-check`](assertion-without-a-check.md) — tests that pass
  against a fixture the real path never produces
