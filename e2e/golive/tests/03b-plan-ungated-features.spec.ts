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
  ['060', 'data-management', '/data-management/modules'],
  ['061', 'data-management', '/data-management/imports'],
  ['062', 'attendance-integrations', '/integrations/attendance/connectors'],
  ['063', 'attendance-integrations', '/integrations/gateways'],
  ['064', 'desktop-agent', '/agent/settings'],
  ['065', 'compliance', '/audit-logs'],
];

for (const [id, feature, path] of UNGATED) {
  test(`[DPQA-ENT-${id}] Starter owner is refused ${path} (${feature})`, async ({ request }) => {
    const token = await apiToken(request, 'A', 'OWNER');
    const r = await api(request, token, 'GET', path);
    expect([402, 403], `GET ${path} -> ${r.status}`).toContain(r.status);
  });
}
