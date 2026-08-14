# Rollback Runbook

**Rollback is not always "deploy the previous commit."** Whether that works
depends entirely on what the release changed.

## 1. Classify the change

| Class | Verdict | Action |
|---|---|---|
| `CODE_ONLY` | **ROLLBACK_SAFE** | Redeploy the previous SHA |
| `CONFIG` | **ROLLBACK_SAFE** | Restore previous values, restart |
| `DATABASE_ADDITIVE` | **ROLLBACK_SAFE** | Redeploy previous code; new columns sit unused |
| `DATABASE_DESTRUCTIVE` | **MANUAL_RECOVERY_REQUIRED** | Old code cannot see dropped data — restore from backup |
| `DATA_MIGRATION` | **FORWARD_FIX_PREFERRED** | Reversing a transform usually loses information |
| `EXTERNAL_INTEGRATION` | **FORWARD_FIX_PREFERRED** | External state already changed; you cannot un-send |
| `MULTI_COMPONENT_CONTRACT` | Ordered rollback | Reverse of deployment order: frontends, then API |

## 2. The database problem

On Render, `preDeployCommand` runs `prisma migrate deploy` **automatically**.
Redeploying an older SHA does **not** roll the schema back — there are no
down-migrations here.

- **Additive migration** (new nullable column, new table, new enum member) —
  previous code ignores it. Code rollback is safe.
- **Destructive migration** (dropped or renamed column, narrowed type, removed
  enum member) — previous code expects what no longer exists. **Code rollback
  will not restore service.** Restore from backup, or forward-fix.

This is exactly why destructive changes are staged expand → migrate → contract,
with the contract step in a *later* release.

## 3. Decide

```
Is the change DATABASE_DESTRUCTIVE or DATA_MIGRATION?
   yes -> FORWARD_FIX or MANUAL_RECOVERY. Do not redeploy blindly.
   no  -> Is a previous known-good SHA available?
            yes -> roll back, then verify
            no  -> forward fix
```

## 4. Execute a code rollback

1. Identify the last known-good SHA from `release-history/`.
2. Confirm it predates no migration the database has already applied
   destructively.
3. Redeploy that SHA.
4. Health check, then smoke tests — **a rollback is a deployment** and earns the
   same verification.
5. Record it in `release-history/`, and update the original release record's
   verdict to `ROLLED_BACK`.

## 5. Partial failure

If some components deployed and others did not, enter `PARTIAL_FAILURE`:

1. Establish each component's actual state — do not assume.
2. **Stop deploying downstream dependencies.**
3. If the API is on the new version and the frontends are not, decide whether
   the API is backward compatible. If it is, hold; if not, roll the API back.
4. Record every component's state in the release record.

## 6. After any rollback

Ask why the gates passed. A rollback almost always means a gate was missing, not
that someone was careless.

- Add the missing check to `readiness-checklist.md` or `smoke-tests.md`.
- If it was a code defect, run the QA bug learning loop: a regression test that
  fails without the fix, a register entry, and a bug pattern if the class is new.
