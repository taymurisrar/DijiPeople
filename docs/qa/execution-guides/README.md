# Execution Guides

**Scenarios say what must be true. Guides say how to find out.**

A scenario in [`../scenarios/`](../scenarios/) is a durable, id'd statement of a
property — one that outlives the run that invented it, so QA can re-select it
rather than re-invent it. It is deliberately short.

A guide here is the other half: an ordered, executable session that walks a
person or an agent through a set of surfaces, with the environment they need,
the exact steps, what correct looks like, and the traps that make a step look
like it passed when it did not.

## When to write one

When the work is **visual or interactive**, and the automated coverage is
therefore a floor rather than a proof. `apps/admin` jest has no jsdom and
`apps/landing`'s runs in node ([[ITEM-0001]]), so nothing in either app has ever
been rendered in a test. Every UI defect this repository has shipped was
invisible to every test that existed and obvious in a screenshot.

A guide is not a substitute for a scenario. Write both: the scenario is what
gets selected on the next change to that module, and the guide is what gets run.

## How to run one

Work top to bottom. Record a verdict per step, not per suite — "Suite B passed"
loses the one step in nine that was skipped. Every step has an id so a finding
can name it.

**A step whose precondition could not be met is `BLOCKED`, never `PASS`.** That
distinction is the entire value of recording verdicts at all.

Findings become BUG records under [`../../bugs/`](../../bugs/) with the step id
in Evidence. QA establishes what is true; the Architect decides what happens
about it.

## Index

| Guide | Covers | Written |
|---|---|---|
| [2026-08-22 — Platform Admin UX, document rendering and tenant recovery](2026-08-22-admin-ux-and-document-rendering.md) | Contract rendering, template editor, console theme, sticky layout, tenant provisioning recovery, notifications, landing wizard and features, timeline paging | 2026-08-22 |
