import { test, expect } from '../fixtures/test';
import { api, apiToken } from '../fixtures/tenants';

/**
 * DPQA-ENT-06x: the four paid features that carry NO route guard according to ADR-0009
 * (`desktop-agent`, `compliance`, `data-management`, `attendance-integrations` — see ENTITLEMENT_UNGATED_FEATURE_KEYS).
 * A Starter tenant does not buy any of them. Under ENFORCE a Starter owner must still be refused at the API; if it is not,
 * the plan comparison shown to customers is not true for that feature (DP-QA-010).
 * Provisioned tenant A (Starter), owner role, enforcement ENFORCE on the QA database.
 */
const UNGATED: Array<[id: string, feature: string, path: string]> = [
  ['062', 'attendance-integrations', '/integrations/attendance/connectors'],
  ['063', 'attendance-integrations', '/integrations/gateways'],
  ['064', 'desktop-agent', '/agent/settings'],
  ['065', 'compliance', '/audit-logs'],
];

// RUN-006 requirement change (owner-approved): BASIC import / export / templates are available on EVERY plan including Starter, with role-based security.
// Only ADVANCED data management is premium. ENT-060/061 formerly asserted the opposite (Starter refused) and are superseded; they now assert the new contract.
// Which routes are "advanced" is a contract detail Session 2 must name in its handoff - until then nothing advanced is asserted (see RUN-006-PREPARATION).
for (const [id, path] of [['060', '/data-management/modules'], ['061', '/data-management/imports']] as const) {
  test(`[DPQA-ENT-${id}] Starter owner CAN use basic data management ${path} (basic import/export is on every plan)`, async ({ request }) => {
    const token = await apiToken(request, 'A', 'OWNER');
    const r = await api(request, token, 'GET', path);
    expect(r.status, `GET ${path} -> ${JSON.stringify(r.body).slice(0, 160)}`).toBe(200);
  });
}

for (const [id, feature, path] of UNGATED) {
  test(`[DPQA-ENT-${id}] Starter owner is refused ${path} (${feature})`, async ({ request }) => {
    const token = await apiToken(request, 'A', 'OWNER');
    const r = await api(request, token, 'GET', path);
    expect([402, 403], `GET ${path} -> ${r.status}`).toContain(r.status);
  });
}
