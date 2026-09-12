---
ID: ITEM-0181
aliases: [ITEM-0181]
Title: A visual email template editor with a variable picker and read-only system templates
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, notifications]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: BUG-3500
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0181 — A visual email template editor with a variable picker and read-only system templates

## Summary

Creating or editing an email template means writing raw HTML into a textarea.
The variables are hand-written JSON in two more textareas, "Available variables
JSON" and "Sample/Test Variables JSON", and the template key is typed by hand.
The event dropdown offers about 55 events, including ones that never fire.
System templates carry a banner saying they are read-only, yet every field
beneath it looks editable. The template list shows each key twice, mixes two
key conventions and overflows so the Version column is cut off.

The owner decided on 2026-09-13 to replace this with a **rich-text editor, a
variable picker and a live preview**. System templates open read-only with a
single **Customize** action that clones them into the tenant. The event picker
lists only events that fire.

## Why It Matters

Template copy is what a tenant's employees read. At the moment an HR
administrator can only change it by editing HTML and JSON. In practice that
means nobody outside engineering can, and so the placeholder bodies in
[[BUG-3500]] stay in production. A form that looks editable but is not wastes
the attempt and hides the path that works, cloning. Offering events that never
fire lets an administrator write a template nothing will ever send.

## Evidence

Observed on the demo tenant (`https://dijipeople-demo.ws.dijipeople.com`) as
the workspace owner, deployed build at `df0f84f1`.

**N4 — create form.**
`apps/web/app/(authenticated)/settings/notifications/_components/email-template-create-form.tsx`
renders the HTML body and the "Available variables JSON" field as plain
`<textarea>` elements (`:251`, `:262-263`), plus a free-text template key and an
event dropdown of about 55 entries that includes events with no emitter.

**N7 — editor on a system template ("Leave approved email").**
`apps/web/app/(authenticated)/settings/notifications/_components/email-template-editor.tsx`
computes `readOnly = template.isSystem || !canManage` (`:41`) and shows "System
templates are read-only. Clone one into your tenant before editing." (`:185`).
Every field still renders as a full-size input or textarea with `disabled`
(`:193-304`), including the Save Template button (`:316`). Visually this is
indistinguishable from an editable form. The Preview and Test Send panel
(`:341`) takes a raw "Sample/Test Variables JSON" textarea (`:342-343`) and a
"Dry run" checkbox (`:402`). Variables appear as `{{actionUrl}}`-style chips.
The Module dropdown lists Payroll, Claims, Loans, Benefits, Recruitment,
Onboarding and Performance for a Starter-plan tenant that has none of them.

**N3 — list.**
`apps/web/app/(authenticated)/settings/notifications/_components/email-templates-table.tsx`
has a Template Key column (`:82-86`) and also prints the key as a subtitle under
the name. Keys mix `auth.otp` and `AUTH_ACCOUNT_ACTIVATION`. At 1440px the table
overflows and the Version column (`:145`) is cut off. The list has no preview.
Templates for events that cannot fire (for example `AUTH_OTP`) are listed as
ACTIVE.

## Proposed Approach

An ExecPlan is needed under `PLANS.md`. It introduces an editing model, may
introduce an editor dependency that needs justification, and changes how
template bodies are stored or sanitised.

1. **Editor.** A rich-text editor producing the stored HTML body, with the
   plain-text body derived from it or edited alongside. Server-side
   sanitisation stays the authority for what HTML is accepted. Before adding a
   dependency, check whether an existing editor is already in the workspace;
   justify any new one in the plan.
2. **Variables.** Derive available variables from the event's catalog
   definition, not from hand-written JSON. Offer them through a picker that
   inserts a token at the cursor. Build preview sample values from the same
   definition, with optional overrides in a form, never a JSON textarea.
3. **Preview.** A live rendered preview of subject and body with sample values,
   next to the editor, updating as the administrator types.
4. **System templates.** Open read-only as a rendered preview, not as disabled
   inputs, with one Customize action that clones the template into the tenant
   and opens the clone in the editor.
5. **Event picker.** List only events that have an emitter and are available on
   the tenant's plan, using the same availability source as [[ITEM-0180]].
   Generate the key from the event; do not type it.
6. **List.** Show the key once, or not at all as primary text. No horizontal
   overflow at 1440px. Offer a preview from the row.

## Acceptance Criteria

- Creating a template requires no HTML or JSON typed by the administrator.
- Inserting a variable from the picker places a valid token in the body, and the
  preview renders it with a sample value.
- Opening a system template shows no input or textarea for its content, only a
  preview and a Customize action. Customize creates a tenant-owned copy and
  opens it for editing.
- The event picker offers no event that lacks an emitter, and no module outside
  the tenant's plan.
- The template key is not a free-text field.
- The templates list shows each key at most once and does not overflow
  horizontally at 1440px.
- Stored HTML is still sanitised server-side, proven by an existing or extended
  API spec.

## Dependencies

[[BUG-3500]] replaces the placeholder bodies. Its drafted copy should be
authored in, or at least render correctly in, this editor. [[ITEM-0180]]
should define "fires" before the picker narrows on it. [[ITEM-0174]] settles
the key convention the list displays.

## Related Items

[[BUG-3500]] placeholder template bodies. [[ITEM-0180]] the events page.
[[ITEM-0169]] catalog hygiene. [[ITEM-0174]] key convention. [[ITEM-0183]]
helper-text removal.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3500]]
- Modules — [[tenant-application]], [[notifications]]

<!-- GRAPH:END -->
