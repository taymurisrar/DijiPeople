---
paths:
  - ".github/**"
  - "scripts/**"
---

# CI and release rules

- Never relax a required check, raise --max-warnings, or retry a failing test into green (CI-002, CI-004).
- Workflow changes are proposals needing review. Classify failures with `node scripts/ci-doctor.mjs`.
- Production deploys need explicit owner approval; main is production (GIT-001).

Policy ids and enforcement: `docs/engineering/policy-catalogue.json`.
