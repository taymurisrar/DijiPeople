---
SCENARIO_ID: QA-SETTINGS-035
aliases: [QA-SETTINGS-035]
TITLE: A lookup custom field lists and saves a record of its target
AREA: settings
MODULE: customization
TYPE: UNIT
RISK: MEDIUM
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: apps/web/lib/runtime/custom-fields.spec.ts
RELATED_BUGS: [BUG-3787]
RELATED_REGRESSIONS: [REG-640]
LAST_RUN: 2026-09-27
LAST_RESULT: PASS
CREATED_AT: 2026-09-27
UPDATED_AT: 2026-09-27
---

# QA-SETTINGS-035 — A lookup custom field lists and saves a record of its target

## Preconditions

- A tenant with departments, and a published lookup custom field on Employees whose target is Departments.
- A custom module with a lookup field, for the custom-module case.

## Steps

1. Open an employee's edit page and open the lookup field.
2. Type part of a department's name.
3. Choose a department and save.
4. On a custom module's record form, open its lookup field.
5. On a form with such a field, change a system lookup that another field depends on.

## Expected Result

- Step 1: the dropdown lists the tenant's departments by name.
- Step 2: the list narrows to matching names.
- Step 3: the employee's `customFields` holds the chosen department's id.
- Step 4: the target module's records are listed, labelled by its primary-name column, or failing that its first text column.
- Step 5: the dependent system lookup keeps the options the page had, and is never emptied by the wrapper.

## Notes

Created 2026-09-27 at `599af68c`.

Run on 2026-09-27:
- Steps 1–3 in a browser (scripted Playwright). The list showed Engineering, Finance and Human Resources; Finance was saved.
- Steps 2, 4 and 5 are covered by `apps/web/lib/runtime/custom-fields.spec.ts`.
