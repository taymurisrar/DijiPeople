# 08 - Releases

Release notes and deployment history.

Naming: `Release — <YYYY-MM-DD>.md`

## Why this exists

Git is the authoritative change history. This is the **narrative** layer: what
shipped, to whom, what to watch, and what actually happened afterwards.

## Suggested shape

```markdown
# Release — YYYY-MM-DD

## Summary
## Shipped
- Features (link the requirement notes)
- Fixes (link the bug notes)
## Database migrations
Names, whether reversible, backfills run.
## Configuration changes
New environment variables, new seed configuration, new platform settings.
## Deployment steps taken
API (Render), apps (Vercel), database (Neon).
## Verification
Which checks were run and their results.
## Issues encountered
## Rollback plan (if any)
## Follow-ups
```

## Deployment facts

- API → **Render**, `render.yaml`, `preDeployCommand: npm --workspace api run release`
  (= `prisma migrate deploy` → `seed:config` → `seed:verify` → `seed:admin`)
- Next.js apps → **Vercel**
- Database → **Neon PostgreSQL**
- Post-deploy smoke: `npm run smoke:deployment`
- Checklist: `DEPLOYMENT_CHECKLIST.md` in the repository

**There is no CI.** Validation before a release is a human responsibility —
record in the release note which commands were run and what they returned.
