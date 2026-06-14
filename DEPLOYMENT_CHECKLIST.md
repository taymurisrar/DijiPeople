# DijiPeople Deployment Checklist

## Targets

- Frontend apps: Vercel
- API: Render
- Database: Neon PostgreSQL

## Required Environment Variables

### Render API

- `DATABASE_URL`: Neon pooled or direct PostgreSQL connection string.
- `JWT_ACCESS_SECRET`: production secret, at least 32 characters.
- `JWT_REFRESH_SECRET`: production secret, at least 32 characters.
- `JWT_ACCESS_TTL`: optional, default `15m`.
- `JWT_REFRESH_TTL`: optional, default `7d`.
- `NODE_ENV=production`
- `APP_ENV=production`
- `API_ORIGIN`: public API origin, for example `https://api.example.com`.
- `CORS_ALLOWED_ORIGINS`: comma-separated frontend origins, for example `https://app.example.com,https://admin.example.com,https://example.com`.
- `AUTH_COOKIE_DOMAIN`: optional shared cookie domain when apps share a parent domain.
- `PLATFORM_SUPER_ADMIN_EMAIL`: required for the Admin App super admin seed.
- `PLATFORM_SUPER_ADMIN_PASSWORD`: required, minimum 12 characters.
- `ENABLE_DEMO_DATA_RESET=false`: keep disabled in production unless a deliberate demo environment requires it.

### Vercel Apps

Set these for `apps/web`, `apps/admin`, and `apps/landing` as applicable:

- `NEXT_PUBLIC_API_BASE_URL`: API base including `/api`, for example `https://api.example.com/api`.
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_WEB_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_LANDING_URL`
- `AUTH_COOKIE_DOMAIN`: if using shared cookies across subdomains.

## Neon Setup

1. Create the Neon project and database.
2. Copy the PostgreSQL connection string into Render as `DATABASE_URL`.
3. Use pooled URLs for app runtime if desired, but use a migration-safe connection for `prisma migrate deploy`.
4. Confirm SSL is enabled in the Neon connection string.

## Build Commands

### API on Render

Build command:

```bash
npm ci
npm --workspace api run prisma:generate
npm --workspace api run build
```

Start command:

```bash
npm --workspace api run start:prod
```

Release command before start:

```bash
npm --workspace api run prisma:migrate:deploy
npm --workspace api run seed:config
npm --workspace api run seed:admin
```

### Vercel Apps

Use the matching root directory per app:

- `apps/web`
- `apps/admin`
- `apps/landing`

Build command:

```bash
npm run build
```

Output directory:

- Leave empty/default for Vercel Next.js detection.

## Seed Commands

From repository root:

```bash
npm run seed:admin
npm run seed:config
npm run seed:demo
npm run seed:all
npm run seed:demo:reset
npm run seed:demo:reseed
```

Seed behavior:

- `seed:admin`: upserts only the Admin App `PlatformUser` super admin.
- `seed:config`: idempotently bootstraps production-safe RBAC, notifications, lookups, leave types, and customization metadata.
- `seed:demo`: creates or updates one explicitly tagged disposable demo tenant.
- `seed:all`: runs admin, config, then demo.
- `seed:demo:reset`: deletes only the tagged demo tenant and seed-owned customer account.
- `seed:demo:reseed`: resets and recreates demo data.
- `seed:system`: deprecated alias for `seed:config`.

## Validation Commands

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm --workspace api run build
npm --workspace web run build
npm --workspace admin run build
npm --workspace landing run build
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:status
npm run smoke:deployment
```

For authenticated smoke checks:

```bash
SMOKE_API_BASE_URL=https://api.example.com/api \
SMOKE_ORIGIN=https://app.example.com \
SMOKE_LOGIN_EMAIL=admin@example.com \
SMOKE_LOGIN_PASSWORD='change-me' \
npm run smoke:deployment
```

## Common Issues

- `npm.ps1 cannot be loaded`: PowerShell execution policy is blocking npm scripts. Use `cmd /c npm ...`, Git Bash, or set execution policy for the current user.
- `Cannot find module dist/main.js`: this repo outputs Nest to `dist/src/main.js`; use `npm --workspace api run start:prod`.
- Missing Nest CLI: run `npm ci`; `@nestjs/cli` is a workspace dev dependency for the API.
- Prisma Client missing after deploy: run `npm --workspace api run prisma:generate` before `npm --workspace api run build`.
- Migrations not applied: run `npm --workspace api run prisma:migrate:deploy` against Neon.
- CORS blocked: ensure `CORS_ALLOWED_ORIGINS` includes every Vercel origin exactly, without trailing path.
- Cookies not sticking in production: ensure HTTPS, `NODE_ENV=production`, compatible `AUTH_COOKIE_DOMAIN`, and same-site cross-subdomain behavior.
- Vercel output mismatch: keep the default Next.js output directory; only set `NEXT_STANDALONE=true` for non-Vercel standalone hosting.
- Turbo ignored env changes: confirm deployment env vars are listed in `turbo.json` `globalEnv`.
