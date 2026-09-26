---
SCENARIO_ID: QA-EMPLOYEES-001
aliases: [QA-EMPLOYEES-001]
TITLE: A published custom field on Employees stores, validates and shows a value per employee
AREA: employees
MODULE: employees
TYPE: DATABASE
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/custom-field-values.e2e-spec.ts
RELATED_BUGS: [BUG-3697]
RELATED_REGRESSIONS: [REG-638]
LAST_RUN: 2026-09-26
LAST_RESULT: PASS
CREATED_AT: 2026-09-26
UPDATED_AT: 2026-09-26
---

# QA-EMPLOYEES-001 — A published custom field on Employees stores, validates and shows a value per employee

## Preconditions

- A tenant with a customizer (`customization.read`, `customization.publish`) and at least one employee.
- A second tenant, for the isolation check.

## Steps

1. Add a Choice field `ad_grade` ("Employee Grade", options G1 and G2) to Employees. Do not publish it.
2. Read `GET /employees/custom-fields`, then try to save `customFields: { ad_grade: "G1" }` on an employee.
3. Publish, then read the definitions again.
4. Save `ad_grade: "G9"` on the employee.
5. Save `ad_grade: "G2"`, then open the employee (both the API detail and the employee form).
6. Save an unrelated field, without `customFields`, and open the employee again.
7. Add a masked text field and store a value in it. Then save the form back unchanged, so the payload carries the masked value.
8. Save `ad_grade: null`.
9. From the second tenant, read the definitions and the first tenant's employee id.

## Expected Result

- Steps 1–2: no definition is returned, and nothing is stored.
- Step 3: one definition, `ad_grade`, with both options.
- Step 4: a 400 with `customFields.ad_grade: ["Not a choice for this field."]`. The form shows the error on that field, and nothing is written.
- Step 5: the detail returns `customFields.ad_grade = "G2"`, and the form shows it under "Additional information".
- Step 6: the value is still `G2`.
- Step 7: the stored value is unchanged. The mask is never written back.
- Step 8: the value reads back as `null`.
- Step 9: no definitions and no values.

## Notes

Created 2026-09-26 at `775e2d60`.

Run on 2026-09-26:
- The e2e suite passed, 6/6.
- Steps 1–6 and step 8 were driven over HTTP against a booted API on a seeded throwaway database.
- The form rendering in steps 4–5 is covered by `apps/web/lib/runtime/modules/employee-custom-fields.spec.ts`.
- No browser pass was run: the Playwright MCP server did not connect in that session.
