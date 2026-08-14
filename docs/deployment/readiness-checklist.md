# Deployment Readiness Checklist

Worked by Release/DevOps before any deployment. Every item is evidence-based —
"probably fine" is not a tick.

## Gates

### Git
- [ ] Target SHA known and recorded
- [ ] Working tree clean in the deploying worktree
- [ ] The SHA is reproducible — pushed, not local-only
- [ ] Branch/tag policy satisfied

### Architecture
- [ ] Affected components identified
- [ ] Dependency order determined (`database → API → frontends`)
- [ ] Backward compatibility assessed for the on-prem gateway and desktop agent,
      which upgrade on their own schedule

### QA
- [ ] Verdict is `PASS`, or `PASS WITH RISKS` explicitly accepted
- [ ] **Never deploy on QA FAIL**

### Reviewer
- [ ] Zero unresolved CRITICAL
- [ ] Zero HIGH blockers

### Database
If schema or migrations are affected:
- [ ] Database agent reviewed
- [ ] Migration order known
- [ ] Backward compatible, or a coordinated plan exists
- [ ] Rollback or forward-fix plan written
- [ ] Backup strategy confirmed
- [ ] Production migration command known — here, `preDeployCommand` runs
      `prisma migrate deploy` automatically
- [ ] `DATABASE_URL` verified to point at the intended target

### Configuration
- [ ] Required variables present in the target
- [ ] New variables registered in all four places
- [ ] No secret behind a `NEXT_PUBLIC_` prefix
- [ ] URLs, domains and CORS correct for the environment
- [ ] Production flags correct

### Build
- [ ] Every affected component builds

### Smoke plan
- [ ] Scenarios written **before** deploying

---

## Readiness levels

| Level | Criteria |
|---|---|
| **BLOCKED** | A build fails, a required secret is missing, or a gate cannot be evaluated |
| **NOT_READY** | QA FAIL, unresolved CRITICAL/HIGH, or broken build |
| **READY_WITH_RISKS** | Deployable with explicitly stated, accepted risks |
| **READY_FOR_STAGING** | All gates pass for a non-production target |
| **READY_FOR_PRODUCTION** | All of the below |

`READY_FOR_PRODUCTION` requires **all** of:

1. clean build of every affected component
2. required tests pass
3. no unresolved CRITICAL or HIGH Reviewer findings
4. no QA FAIL
5. migrations reviewed, with rollback or forward-fix
6. required environment variables verified in the target
7. rollback strategy determined and classified
8. health checks available
9. no known secret or configuration blocker
10. required external dependencies configured
11. release notes prepared

---

## Rollback classification

Determined **before** deploying:

| Class | Rollback |
|---|---|
| `CODE_ONLY` | ROLLBACK_SAFE |
| `CONFIG` | ROLLBACK_SAFE |
| `DATABASE_ADDITIVE` | ROLLBACK_SAFE |
| `DATABASE_DESTRUCTIVE` | **MANUAL_RECOVERY_REQUIRED** |
| `DATA_MIGRATION` | FORWARD_FIX_PREFERRED |
| `EXTERNAL_INTEGRATION` | FORWARD_FIX_PREFERRED |
| `MULTI_COMPONENT_CONTRACT` | Ordered rollback, reverse of deploy order |

Never describe a destructive migration as reversible.
