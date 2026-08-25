---
TITLE: Agent UI perception — browser control, component knowledge, and the gap between them
TASK: TASK-0022
WP: WP-01,WP-02,WP-03,WP-04
CREATED_AT: 2026-08-25
VERIFIED_AGAINST_COMMIT: c4035dbb
---

# Agent UI perception — 2026-08-25

Produced by [[TASK-0022]].

An agent asked to review a screen in this product needs two capabilities, and
had neither. It could not drive the running UI, and it could not reliably find
out what a component was already supposed to do. This records what was actually
wrong in each case, because in both the obvious diagnosis was the wrong one.

## The component knowledge was not missing — retrieval could not reach it

The instinct on "agents do not know our components" is to write a component
catalogue. That instinct was wrong here, twice over.

**First, the knowledge already existed.** `ModuleActionBar`,
`runStandardRecordCommand` and `withDefaultActions()` all carry multi-paragraph
rationale directly above the code — including the non-obvious parts, like why
the command bar sits at `z-10` and which five bespoke detail pages inherit
registry defaults they do not implement.

**Second, the actual defect was a hyphen.** `retrieve-knowledge.mjs` scored
literal substrings, so at `2d609724`:

```
retrieve-knowledge.mjs "command bar"  → .agent/context/runtime-module-system.md
                                        (the file documenting the contract)
retrieve-knowledge.mjs command-bar    → not that file, and not any other;
                                        "9 passing mentions filtered out"
```

Same concept, two spellings, opposite outcomes, and no way for the caller to
know which spelling this repository happened to use. A component is written
`ModuleActionBar` in code, `module-action-bar.tsx` on disk and "command bar" in
prose, so an agent may reasonably type any of three and be wrong twice.

**The failure mode is what makes this severe.** Retrieval returns nothing and
says nothing is there. "No prior knowledge exists here" is precisely the
conclusion that produces a repeat defect, and it is the conclusion the
`KNOWN_MISTAKES_TO_AVOID` step exists to prevent. A retrieval step that fails
loudly is a nuisance; one that fails silently is a trap.

Fixed by normalising each term across its spellings and scoring at the best
one — max, never sum, so a document with mixed conventions does not outrank a
consistent one for being inconsistent. Deliberately not stemming and not fuzzy
matching: these terms are identifiers where the variance is punctuation, not
morphology, and edit-distance would drag `partners` into every
`partner-experience` query.

## Generate the index, do not write it

`.agent/context/component-index.md` is harvested from the doc-comments rather
than authored. A prose catalogue of 292 files is the `doc-code-drift` pattern
applied to the document meant to prevent it.

The generator stamps the `**Last verified:**` and `**Verified against commit:**`
lines `validate-framework.mjs` already requires of every context file, so the
index cannot claim a freshness it does not have, and `--check` fails CI on
drift in either direction — a changed output, or a changed source comment.
Mutation-tested both ways rather than assumed.

**It reports what it omits.** 93 of 846 exports carry a doc-comment; the other
753 are left out rather than listed as bare names, because a list of
identifiers is a table of contents, not knowledge — which `retrieve-knowledge`
says in its own source and enforces by filtering generated indexes out of its
results. The ratio is itself knowledge, recorded as [[ITEM-0098]] and triaged
`DEFER`: document on touch, never bulk-author, since 753 comments written in
one pass would restate signatures and make the index look complete while
carrying nothing.

`ModuleActionBar` was one of the 753. The most-imported component in the admin
runtime kit, the one the whole command-bar contract runs through, and it had no
comment above its export — which is how the gap was noticed at all.

## Perception without hands is not review

An agent could already see a screen: render a PNG with Playwright, then read
the image. What it could not do was click. Every look cost a bespoke script,
and no state behind an interaction was reachable.

`@playwright/mcp` closes that, and its design choice is the right one for this
product: it drives the **accessibility tree, not pixels**. Deterministic, and
it fails exactly where a screen reader fails. `apps/admin` carries zero
`data-testid` attributes, so admin is addressed entirely by role and accessible
name — meaning accessibility work and automation work are the same work in that
app, and an element the agent cannot reach is a genuine finding rather than a
tooling problem.

## The two halves only work together

This is the part worth carrying forward. Browser control gives an agent
perception. It does not give it a standard to judge against, and "is this page
showing the right thing" is unanswerable without one. An agent with a browser
and no retrieval can only describe what it sees.

So `.agent/skills/ui-review.md` puts retrieval **first** and requires the
prediction to be written down before the browser opens. A prediction made after
looking is not a prediction, and the most common way a UI review degrades is
into a narration of the screenshot.

The admin command bar is the standing example of why this ordering matters:
which buttons exist comes from `define()` and the module's `capabilities` map
in the registry, not from `ModuleActionBar`, which renders what it is handed.
An agent reviewing the component would learn nothing about which buttons that
module gets — and would have no way to notice one missing.

## A "blocked" note is a claim about the environment, and those expire

`.agent/skills/README.md` listed `qa-browser-regression` as **"Blocked, not
deferred — no browser automation exists in any workspace"**, under a rule that a
skill for an absent capability is fiction. The rule was right. Its premise had
been false for months: the `e2e` workspace brought Playwright and a Chromium
install, and nobody returned to the row.

The general lesson is not about that row. Framework documents record two
different kinds of statement — decisions, which stand until reversed, and
environment facts, which rot. This repository already carries provenance lines
on `.agent/context` files for the second kind. A "blocked pending tooling" note
is an environment fact wearing a decision's clothes, and it needs re-checking
rather than trusting.

## Related

- [[TASK-0022]] — the task
- [[ITEM-0098]] — the undocumented-export measurement this produced
- [[runtime-module-system]] — the command bar contract the examples above use
- [[platform-admin]] — the app the review procedure was designed against
