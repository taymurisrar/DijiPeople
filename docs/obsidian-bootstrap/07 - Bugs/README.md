# 07 - Bugs

Bug reports and investigation notes.

Use `99 - Templates/Bug.md`.

Naming: `Bug — <short description>.md`

## Why bugs live here and not only in a tracker

The tracker records that a bug existed. These notes record **what was learned**:
the root cause, the data impact, why the existing tests did not catch it, and
what would have prevented it. That knowledge is what stops the same class of
defect recurring.

## Always answer explicitly

- **Data impact.** Was data corrupted or exposed? Were other tenants affected?
  Answer even when the answer is "no" — a stated "no" is evidence; silence is
  not.
- **Regression test.** What now prevents recurrence? If nothing, why not.
- **Prevention.** What would have caught it earlier — a test, a type, a review
  checklist item, or a correction to `docs/architecture/`.

## Severity

CRITICAL · HIGH · MEDIUM · LOW — defined in the template, aligned with the
Reviewer role's ranking in `.agent/agents/reviewer.md`.

Anything touching tenant isolation, authorization, audit or payroll amounts
starts at HIGH and is argued down, not up.
