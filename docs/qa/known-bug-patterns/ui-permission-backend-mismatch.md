# Bug Pattern — UI Permission / Backend Mismatch

## Pattern
A screen is gated on one permission while the actions inside it are enforced on
another. Users see a page whose every button returns 403 — or, worse, an
administrator loses a screen they are entitled to.

## Why it happens in DijiPeople
Frontend and backend gating are maintained independently and evaluated
differently:

- The backend guard has an **elevated-role bypass** (`hasElevatedTenantRole`).
- The frontend helper is a **literal key check with no bypass**. An admin who
  does not literally hold the key fails the frontend check even though the
  backend would allow them.
- `apps/web/lib/security-keys.ts` is a hand-maintained mirror of the API
  constants with **no generator**, so the two drift silently.

That asymmetry means the obvious fix — "gate the nav on the same key the backend
now requires" — can hide a screen from administrators.

## Example architecture area
The Organizations and Business Units settings screens are gated on
`settings.read`, which `manager` and `recruiter` hold. After the backend began
requiring `organization.manage`, those roles still see both screens and every
action on them 403s. Re-gating the nav on `organization.manage` alone would have
hidden the screens from `global-admin` and `system-admin`, who do **not**
literally hold that key.

## Detection checklist
- Which permission gates the nav entry / screen / button?
- Which permission does the backend actually enforce?
- Do elevated roles literally hold the frontend key, or only pass the backend
  bypass?
- Is the key mirrored correctly in `security-keys.ts`?
- If a backend permission is being tightened, what happens to every screen
  currently gated on the old key?

## Required regression test
Frontend gating logic is testable as pure logic (jsdom is not available). Assert
which roles see the control, including the elevated roles.

## Agent responsible
Frontend, with Architect confirming both sides during planning.

## Reviewer check
For any backend authorization change, check the frontend gating of every screen
that calls it. Report the mismatch rather than assuming the UI will be fixed
later.

## QA check
For each affected role: does the control appear, and does using it succeed?
Appearing and failing is a defect; both matter.

## Prevention rule
UI gating is cosmetic and must still *agree* with the backend. Change both sides
together, and verify elevated roles explicitly — the two systems do not evaluate
the same way.
