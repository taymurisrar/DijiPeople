# WP-02 per-route platform authorization mapping

One row per route on SuperAdminController, AdminLeadsController, AdminLegalController and DemoDataController, generated from controller metadata and ROLE_PERMISSIONS (TASK-0032 WP-02, ADR-0018). Summary and role codes: [[WP-02-report]].

| Route | Old allowed | New permission | New allowed | Change |
|---|---|---|---|---|
| GET /super-admin/dashboard-summary | SA, OWN, MEM | dashboard.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, PTM, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/lifecycle-options | SA, OWN, MEM | dashboard.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, PTM, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/operators | SA, OWN, MEM | dashboard.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, PTM, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| POST /super-admin/leads/:leadId/convert | SA, OWN, MEM | leads.create | SA, MEM, OWN, PADM, PSM, PSU | widened |
| GET /super-admin/customers | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId/onboardings | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId/tenants | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId/subscriptions | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId/invoices | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| GET /super-admin/customers/:customerAccountId/payments | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| POST /super-admin/customers | SA, OWN, MEM | customers.create | SA, MEM, OWN, PADM, PSM | widened |
| PATCH /super-admin/customers/:customerAccountId | SA, OWN, MEM | customers.update | SA, MEM, OWN, PADM, POPS, PSM | widened |
| DELETE /super-admin/customers | SA, OWN, MEM | customers.update | SA, MEM, OWN, PADM, POPS, PSM | widened |
| GET /super-admin/customer-onboarding | SA, OWN, MEM | onboarding.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, AUD | widened |
| GET /super-admin/customer-onboarding/:onboardingId | SA, OWN, MEM | onboarding.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, AUD | widened |
| POST /super-admin/customer-onboarding | SA, OWN, MEM | onboarding.create | SA, MEM, OWN, PADM, POPS, PSM | widened |
| PATCH /super-admin/customer-onboarding/:onboardingId | SA, OWN, MEM | onboarding.update | SA, MEM, OWN, PADM, POPS | widened |
| DELETE /super-admin/customer-onboarding | SA, OWN, MEM | onboarding.update | SA, MEM, OWN, PADM, POPS | widened |
| POST /super-admin/customer-onboarding/:onboardingId/create-tenant | SA, OWN, MEM | onboarding.create | SA, MEM, OWN, PADM, POPS, PSM | widened |
| GET /super-admin/tenants | SA, OWN, MEM | tenants.read | SA, MEM, OWN, PADM, POPS, SPM, SPA, MON, AUD | widened |
| GET /super-admin/tenant-slug/availability | SA, OWN, MEM | tenants.read | SA, MEM, OWN, PADM, POPS, SPM, SPA, MON, AUD | widened |
| GET /super-admin/tenants/:tenantId | SA, OWN, MEM | tenants.read | SA, MEM, OWN, PADM, POPS, SPM, SPA, MON, AUD | widened |
| PATCH /super-admin/tenants/:tenantId | SA, OWN | tenants.update | SA, MEM, OWN, PADM, POPS | widened |
| PATCH /super-admin/tenants/:tenantId/slug | SA | platform.tenants.administer | SA, OWN | widened |
| PATCH /super-admin/tenants/:tenantId/customer-account | SA, OWN, MEM | tenants.update | SA, MEM, OWN, PADM, POPS | widened |
| PATCH /super-admin/tenants/:tenantId/status | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| GET /super-admin/agent-assignments | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| PATCH /super-admin/tenants/:tenantId/agent-assignment | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| GET /super-admin/tenants/:tenantId/audit-logs | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| GET /super-admin/tenants/:tenantId/access-users | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| POST /super-admin/tenants/:tenantId/access-users | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| PATCH /super-admin/tenants/:tenantId/access-users/:userId | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| POST /super-admin/tenants/:tenantId/access-users/:userId/reset-activation | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| POST /super-admin/tenants/:tenantId/access-users/:userId/reset-password | SA, OWN | platform.tenants.administer | SA, OWN | unchanged |
| GET /super-admin/tenants/:tenantId/invoices | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| PATCH /super-admin/tenants/:tenantId/subscription | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| GET /super-admin/subscriptions | SA, OWN, MEM | subscriptions.read | SA, MEM, OWN, PADM, FIN, BIL, SPM, SPA, AUD | widened |
| GET /super-admin/invoices | SA, OWN, MEM | invoices.read | SA, MEM, OWN, PADM, FIN, BIL, SPM, SPA, AUD | widened |
| GET /super-admin/invoices/:invoiceId | SA, OWN, MEM | invoices.read | SA, MEM, OWN, PADM, FIN, BIL, SPM, SPA, AUD | widened |
| GET /super-admin/invoices/:invoiceId/pdf | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| POST /super-admin/invoices/:invoiceId/email | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| PATCH /super-admin/invoices/:invoiceId/status | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| POST /super-admin/subscriptions/:subscriptionId/invoices | SA, OWN | platform.billing.administer | SA, OWN | unchanged |
| GET /super-admin/payments | SA, OWN, MEM | payments.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/payments | SA, OWN | payments.manage | SA, OWN, PADM | widened |
| GET /super-admin/tenants/:tenantId/features | SA, OWN, MEM | tenants.read | SA, MEM, OWN, PADM, POPS, SPM, SPA, MON, AUD | widened |
| PATCH /super-admin/tenants/:tenantId/features | SA, OWN, MEM | tenants.update | SA, MEM, OWN, PADM, POPS | widened |
| PATCH /super-admin/tenants/:tenantId/primary-owner | SA, OWN, MEM | tenants.update | SA, MEM, OWN, PADM, POPS | widened |
| GET /super-admin/tenants/:tenantId/owner-summary | SA, OWN, MEM | tenants.read | SA, MEM, OWN, PADM, POPS, SPM, SPA, MON, AUD | widened |
| POST /super-admin/tenants/:tenantId/owner/reset-password | SA, OWN, MEM | tenants.create | SA, MEM, OWN, PADM, POPS | widened |
| POST /super-admin/tenants/:tenantId/owner/resend-activation | SA, OWN, MEM | tenants.create | SA, MEM, OWN, PADM, POPS | widened |
| GET /super-admin/plans | SA, OWN, MEM | plans.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| GET /super-admin/feature-catalog | SA, OWN, MEM | plans.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| GET /super-admin/plans/:planId | SA, OWN, MEM | plans.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/plans | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| PATCH /super-admin/plans/:planId | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| DELETE /super-admin/plans/:planId | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| GET /super-admin/plans/:planId/prices | SA, OWN, MEM | plans.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/plans/:planId/prices | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| PATCH /super-admin/plans/:planId/prices/:priceId | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| DELETE /super-admin/plans/:planId/prices/:priceId | SA, OWN | plans.manage | SA, OWN, PADM | widened |
| GET /super-admin/promotions | SA, OWN, MEM | billing.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| GET /super-admin/promotions/targets | SA, OWN, MEM | billing.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/promotions | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| PATCH /super-admin/promotions/:promotionId | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| DELETE /super-admin/promotions/:promotionId | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| POST /super-admin/promotions/:promotionId/deactivate | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| POST /super-admin/customers/:customerAccountId/stripe-customer | SA, OWN, MEM | customers.create | SA, MEM, OWN, PADM, PSM | widened |
| GET /super-admin/customers/:customerAccountId/payment-state | SA, OWN, MEM | customers.read | SA, MEM, OWN, PADM, POPS, PSM, PSU, CTM, LGL, FIN, BIL, SPM, SPA, MON, AUD | widened |
| POST /super-admin/customers/:customerAccountId/recheck-payment | SA, OWN, MEM | customers.create | SA, MEM, OWN, PADM, PSM | widened |
| POST /super-admin/subscriptions/:subscriptionId/stripe-subscription | SA, OWN | subscriptions.manage | SA, OWN, PADM | widened |
| POST /super-admin/billing/stripe/webhook | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| GET /super-admin/billing/diagnostics | SA, OWN, MEM | billing.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/billing/test-stripe-connection | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| GET /super-admin/billing/stripe-webhook-events | SA, OWN, MEM | billing.read | SA, MEM, OWN, PADM, FIN, BIL, AUD | widened |
| POST /super-admin/billing/stripe-webhook-events/:id/retry | SA, OWN | billing.manage | SA, OWN, PADM, FIN | widened |
| GET /super-admin/platform-settings | SA, OWN | settings.read | SA, OWN, PADM, AUD | widened |
| PATCH /super-admin/platform-settings | SA, OWN | settings.manage | SA, OWN, PADM | widened |
| GET /super-admin/platform-settings/exchange-rates | SA, OWN | settings.read | SA, OWN, PADM, AUD | widened |
| POST /super-admin/platform-settings/exchange-rates/refresh | SA, OWN | settings.manage | SA, OWN, PADM | widened |
| PUT /super-admin/platform-settings/exchange-rates/:quoteCurrency | SA, OWN | settings.manage | SA, OWN, PADM | widened |
| DELETE /super-admin/platform-settings/exchange-rates/:quoteCurrency | SA, OWN | settings.manage | SA, OWN, PADM | widened |
| GET /super-admin/platform-email | SA, OWN | settings.read | SA, OWN, PADM, AUD | widened |
| PATCH /super-admin/platform-email | SA, OWN | settings.email.manage | SA, OWN, PADM | widened |
| POST /super-admin/platform-email/test-connection | SA, OWN | settings.email.test | SA, OWN, PADM | widened |
| POST /super-admin/platform-email/test-email | SA, OWN | settings.email.test | SA, OWN, PADM | widened |
| GET /super-admin/platform-email/deliveries | SA, OWN | settings.read | SA, OWN, PADM, AUD | widened |
| GET /super-admin/platform-email/templates | SA, OWN | settings.read | SA, OWN, PADM, AUD | widened |
| PATCH /super-admin/platform-email/templates/:templateId | SA, OWN | settings.email.manage | SA, OWN, PADM | widened |
| GET /super-admin/leads | SA, OWN, MEM | leads.read | SA, MEM, OWN, PADM, PSM, PSU, PTM, AUD | widened |
| GET /super-admin/leads/:leadId | SA, OWN, MEM | leads.read | SA, MEM, OWN, PADM, PSM, PSU, PTM, AUD | widened |
| POST /super-admin/leads | SA, OWN, MEM | leads.create | SA, MEM, OWN, PADM, PSM, PSU | widened |
| PATCH /super-admin/leads/:leadId | SA, OWN, MEM | leads.update | SA, MEM, OWN, PADM, PSM, PSU, PTM | widened |
| PATCH /super-admin/leads/:leadId/attribution | SA, OWN, MEM | leads.update | SA, MEM, OWN, PADM, PSM, PSU, PTM | widened |
| DELETE /super-admin/leads | SA, OWN, MEM | leads.update | SA, MEM, OWN, PADM, PSM, PSU, PTM | widened |
| PATCH /super-admin/leads/bulk/assign | SA, OWN, MEM | leads.update | SA, MEM, OWN, PADM, PSM, PSU, PTM | widened |
| GET /super-admin/legal/documents | SA, OWN | platform.legal.administer | SA, OWN | unchanged |
| GET /super-admin/legal/versions/:versionId | SA, OWN | platform.legal.administer | SA, OWN | unchanged |
| PATCH /super-admin/legal/versions/:versionId | SA, OWN | platform.legal.administer | SA, OWN | unchanged |
| POST /super-admin/legal/documents/:documentId/drafts | SA, OWN | platform.legal.administer | SA, OWN | unchanged |
| POST /super-admin/legal/versions/:versionId/publish | SA, OWN | platform.legal.administer | SA, OWN | unchanged |
| GET /admin/demo-data/summary | SA, OWN | platform.demoData.delete | SA, OWN | unchanged |
| DELETE /admin/demo-data | SA, OWN | platform.demoData.delete | SA, OWN | unchanged |
| POST /admin/demo-data/reseed | SA, OWN | platform.demoData.delete | SA, OWN | unchanged |