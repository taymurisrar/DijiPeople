# DijiPeople Monorepo

DijiPeople is a multi-tenant SaaS HRM platform organized as a monorepo with separate apps for the public website, tenant product, platform admin, and backend API.

## Local Development Architecture

Default local ports:

- `apps/landing` -> `http://localhost:3000`
- `apps/web` -> `http://localhost:3001`
- `apps/admin` -> `http://localhost:3002`
- `services/api` -> `http://127.0.0.1:4000/api`

Production-oriented target domains:

- landing -> `https://dijipeople.com`
- web -> `https://app.dijipeople.com`
- admin -> `https://admin.dijipeople.com`
- api -> `https://api.dijipeople.com`

## Apps

- `apps/landing`: public marketing website and lead capture
- `apps/web`: authenticated tenant-facing product
- `apps/admin`: DijiPeople internal platform admin and SaaS operations
- `services/api`: NestJS backend API

## Running Locally

Install dependencies from the monorepo root:

```bash
npm install
```

Start individual services:

```bash
npm run dev:landing
npm run dev:web
npm run dev:admin
npm run dev:api
```

Or run the existing Turborepo command:

```bash
npm run dev
```

## Environment Files

Each app/service has an example env file:

- `apps/landing/.env.example`
- `apps/web/.env.example`
- `apps/admin/.env.example`
- `services/api/.env.example`

Primary shared env variables:

- `LANDING_PORT`
- `WEB_PORT`
- `ADMIN_PORT`
- `API_PORT`
- `NEXT_PUBLIC_LANDING_URL`
- `NEXT_PUBLIC_WEB_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_BASE_URL`
- `CORS_ALLOWED_ORIGINS`

## Shared Runtime Config

Cross-app port and URL helpers live in `packages/config/index.js`.

That shared config is used to:

- keep default ports consistent
- derive local URLs cleanly
- avoid hardcoded localhost values inside app code
- keep API CORS defaults aligned with the local app architecture

## Local Communication Flow

- `apps/landing` submits leads to `services/api`
- `apps/web` uses `services/api` for product workflows
- `apps/admin` uses `services/api` for platform operations
- `services/api` allows local requests from landing, web, and admin by default

## Notes

- The backend API now defaults to port `4000`
- Next.js apps keep fixed default ports, but `PORT` can still override them
- Invitation and reset links now derive their web app URL from shared config/env instead of hardcoded localhost strings
