---
ID: ITEM-0024
Title: Landing depends on lucide-react without declaring it
Type: TECH_DEBT
Status: READY
Priority: P2
Severity: LOW
AffectedModules: [apps/landing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0024 — Landing depends on lucide-react without declaring it

## Summary

`apps/landing/app/_components/marketing/lead-form-section.tsx` imports
`lucide-react`, but `apps/landing/package.json` does not list it. It resolves
today only because another workspace (`apps/admin`) depends on it and npm hoists
it to the repository root.

## Why It Matters

The landing build works by accident. If `apps/admin` ever drops or moves
`lucide-react`, the public site's `/request-demo` page stops compiling — with an
error pointing at a file nobody changed.

Low severity because it currently builds and the fix is a one-line dependency
declaration. Recorded rather than fixed because changing a workspace's
dependencies is not what Wave 2 was scoped to touch, and it deserves its own
verification that the hoisted version is the one intended.

## Evidence

- `apps/landing/app/_components/marketing/lead-form-section.tsx:4` —
  `import { ArrowRight, Mail, Phone } from "lucide-react";`
- `apps/landing/package.json` — dependencies are `@repo/config`, `next`,
  `react`, `react-dom`. No `lucide-react`.
- The component is reachable: `/request-demo` renders it.

## Note on this wave's icons

Wave 2 deliberately did **not** use `lucide-react` for the new Features and
Plans icons, precisely because of this. Those icons are inline SVGs drawn on the
Lucide grid using the catalogue's own icon keys
(`apps/landing/app/_components/marketing/feature-icon.tsx`), which adds no
dependency — declared or undeclared — to the public bundle.

## Proposed Approach

Add `lucide-react` to `apps/landing/package.json` at the version admin uses, or
replace the three icons in that one component with the inline set Wave 2 added
and drop the import. The second removes the dependency rather than formalising
it, and is probably the better answer for a marketing bundle.

## Acceptance Criteria

- `apps/landing` builds without relying on another workspace's dependency.
- Either the import is declared, or it is gone.

## Dependencies

None.

## Related Items

[[BUG-0029]]

## History

- 2026-08-16 — found during the Wave 2 component audit.
