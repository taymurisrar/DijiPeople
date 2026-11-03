---
name: dp-security-audit
description: Security audit of an area or the platform (read-only evidence, no destructive tests). Use for security audit requests.
disable-model-invocation: true
---

Lead agent: `dp-security-reviewer` (`.claude/agents/dp-security-reviewer.md`). Task: $ARGUMENTS

Read `docs/engineering/full_technical_audit.md`. Inspect the real code and running system, not docs. Highest priority: tenant isolation, authn/authz, sensitive HR/payroll data, data-loss risk. Parallelise independent areas with subagents; consolidate findings with evidence and severity. Do not modify production data or run destructive tests; preserve a baseline before remediation.
