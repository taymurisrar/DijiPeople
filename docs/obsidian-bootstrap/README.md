# Obsidian Bootstrap

Starter structure for the DijiPeople Obsidian vault.

**This folder is not the vault.** It is source material to copy into a vault
that lives **outside this repository**. Nothing in the application reads it, and
nothing should ever depend on it.

---

## How to use it

1. Create a vault outside the repository, e.g.
   `d:\My Work\hrm-dijipeople\DijiPeople-Vault`.
2. Copy the **contents** of this folder into it — the numbered folders
   `00 - Home/` through `99 - Templates/`. Do not copy this `README.md`.
3. In Obsidian: **Settings → Files and links → Default location for new notes**,
   and **Settings → Templates → Template folder location** → `99 - Templates`.
4. Start from `00 - Home/DijiPeople.md`.

Do not add the vault to this repository or to `.gitignore` as a nested folder.
Keep it separate, and version it separately if you want history.

---

## Structure

```
00 - Home/                 entry point and navigation
01 - Product/              what DijiPeople is, who it serves, positioning
02 - Architecture/         architectural REASONING (not the code)
03 - Modules/              per-domain product knowledge and business rules
04 - Requirements/         feature requirements before they are built
05 - Decisions/            decision narratives; settled ADRs go in the repo
06 - Implementation Plans/ ExecPlans and their history
07 - Bugs/                 bug reports and investigation notes
08 - Releases/             release notes and deployment history
09 - Meetings/             meeting notes
10 - Client Feedback/      what users and clients actually said
11 - Agent Knowledge/      how AI agents should work on this product
99 - Templates/            note templates
```

---

## Knowledge boundary

| Obsidian | Repository |
|---|---|
| Product knowledge | Source code |
| Business requirements and rules | Schemas and migrations |
| Architectural **reasoning** | Architectural **description** (`docs/architecture/`) |
| Decision narratives and discussion | Settled ADRs (`docs/decisions/`) |
| Meeting notes | Executable configuration |
| Client feedback | Tests |
| Implementation history | Implementation-facing documentation |
| Plans, drafts, open questions | `AGENTS.md`, `PLANS.md` |

**Do not turn Obsidian into a copy of the source code.** Reference files and
modules by path (`services/api/src/modules/payroll/`); do not paste them. Pasted
code goes stale silently and there is nothing to catch it.

---

## Rules for these notes

- **Do not fabricate business facts.** Where something cannot be established
  from the repository, write:
  `TODO: Confirm product/business rule.`
  Every starter note here follows that rule — the technical content is verified
  against the code, and business intent is marked as unconfirmed.
- Link liberally with `[[wiki links]]`. A link to a note that does not exist yet
  is a useful marker, not an error.
- Prefer one note per concept over long combined notes.
- When a note's technical content contradicts the code, **the code is right**.
  Fix the note.

## Suggested tags

`#module/employees` `#module/attendance` `#module/payroll` `#module/leave`
`#module/timesheets` `#module/contracts` `#module/leads` `#module/partners`
`#module/settings` `#module/integrations` `#module/tenant-provisioning`
`#status/draft` `#status/confirmed` `#status/needs-review`
`#type/requirement` `#type/decision` `#type/bug` `#type/plan`
