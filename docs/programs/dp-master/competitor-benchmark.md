# DP-MASTER competitor benchmark (WP-01.S2) - retrieved 2026-11-25

Evidence class: **ADVERTISED**. Each row comes from one official vendor page, read
through an automatic summarizer by a research subagent, and was not re-opened by
the author. "UNVERIFIED" means the summary did not show it, not that the vendor lacks
it. No row here is a tested capability; no prices or internal employer policies are
included. Re-verify a row before using it in marketing or a gap decision.

| Vendor (source) | Advertised, relevant to DP-MASTER |
|---|---|
| Zoho People (zoho.com/people) | Core HR; integrated recruitment; custom onboarding workflows, e-signed offers; time and attendance; appraisals; training/LMS; payroll and statutory compliance. Standalone workflow engine UNVERIFIED. |
| BambooHR (bamboohr.com/platform) | Central people data and analytics; ATS; onboarding to offboarding; time tracking; performance; payroll; automated HR workflows; 150+ integrations and an open API. |
| PeopleForce (peopleforce.io) | Profiles, documents and e-signature, assets; ATS with talent pools and scorecards; role-tailored onboarding; timesheets and attendance policies; reviews, 1-on-1s, OKRs, calibration; learning; payroll; workflows, request forms, approvals. Shift rostering UNVERIFIED. |
| Rippling (rippling.com/hris) | Shared employee data across modules; automated onboarding from offer to device shipping; time and attendance; payroll; triggers plus "advanced actions" (conditions and approvals UNVERIFIED); 650+ integrations. |
| Deputy (deputy.com, homepage only) | Multi-location scheduling, shift swaps, demand forecasting; timesheets; breaks, overtime and Fair Workweek rules; POS and payroll integrations. Other areas UNVERIFIED. |
| Hubstaff (hubstaff.com/features) | Timers and timesheets; schedules, absences, PTO; activity levels (stated as not keystrokes), app/URL usage; optional, blurrable or disabled screenshots; role-based access; people can delete their own entries; API, CLI, MCP. |
| Time Doctor (timedoctor.com/features) | Automatic/manual tracking, attendance, breaks; usage and idle time; optional screenshots and recording; privacy guardrails; employees see their own data; manager time approvals. |
| ActivTrak (activtrak.com/product) | Workforce visibility, app/website usage, AI insights, compliance alerts (detail UNVERIFIED), API and MCP. |
| Microsoft Dynamics 365 / Power Automate (learn.microsoft.com) | Cloud flows with branching, looping, parallel branches, run-after failure handling, changesets, approvals; business process flows (stages, required-field gating, per-table limits) with no conditional logic of their own; managed/unmanaged solutions with dependency tracking. Guidance: build new automation as cloud flows rather than classic Dataverse workflows. Synchronous/real-time runs, column wait conditions and pre-image data are marked as gaps for Power Automate. A formal deprecation date for classic workflows was not found (UNVERIFIED). |
| PayPeople (paypeople.pk) | HRIS; Kanban hiring; attendance with biometric sync; goals/OKRs/360; FBR tax slabs, EOBI, PESSI/SESSI, provident fund, final settlement. Vendor assertions, not independently checked. |
| WebHR (web.hr) | HRIS and 250+ reports; ATS; onboarding checklists; web/mobile/biometric clock-in and shift planning; reviews and 360; payroll items incl. provident fund, loans, final settlements. Pakistan statutory detail UNVERIFIED. |

## Gap matrix against the master plan (advertised vs this repository)

| Master plan area | Peers advertise | DijiPeople today (code, 2026-11-24) | Read |
|---|---|---|---|
| Workflow with branching, waits, parallel (WP-19) | Microsoft documents it; HR suites mostly show approvals/workflows without branching | Single action type (send email), flat AND conditions | Largest gap to the stated D18/A-series target |
| Business process flows (WP-20) | Microsoft BPF; HR suites show onboarding checklists | Onboarding templates only | Gap; shared stage engine planned |
| Packages / ALM (WP-21) | Only Microsoft documents managed solutions | `.djpkg` engine for tables, forms, views, widgets | Existing strength, narrower than the target |
| Rostering and coverage (WP-09) | Deputy, WebHR | Work schedules and shift templates, no roster | Gap |
| Performance and reviews (WP-11/32) | BambooHR, PeopleForce, PayPeople, WebHR | None found | Gap |
| Learning (WP-12) | Zoho, PeopleForce | None found | Gap |
| Pakistan payroll (WP-10) | PayPeople names FBR/EOBI/PESSI/SESSI | Payroll, tax rules, loans, claims exist; statutory validation unverified | Validate before claiming parity |
| Monitoring privacy posture (WP-17) | Hubstaff, Time Doctor: optional/blurrable screenshots, employee visibility | Rule-triggered capture, tenant-gated; defaults now privacy-first (WP-17.S2) | Aligned once S2 ships |

## Observations

1. HR suites advertise lifecycle breadth; branching workflow detail is rare outside Microsoft.
2. Only PayPeople names Pakistan statutory items on its page.
3. Monitoring vendors present privacy as configurable controls and employee visibility.
4. Microsoft's own guidance steers new automation away from classic synchronous workflows,
   which supports the master plan's split between in-transaction validation and durable async actions.
5. Gaps in this benchmark: Deputy features page unreachable; API detail for several vendors not confirmed.
