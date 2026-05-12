# Deployment Environment Checklist

## Render API

1. Rotate the compromised Neon production connection string.
2. Add the rotated `DATABASE_URL` only in Render.
3. Add all API variables from `services/api/.env.production.example`.
4. Generate unique 32+ character values for global, web, admin, and agent JWT secrets.
5. Set `CORS_ALLOWED_ORIGINS` exactly to:
   `https://diji-people-admin.vercel.app,https://diji-people-web.vercel.app,https://diji-people-landing.vercel.app`
6. Keep `COOKIE_DOMAIN` empty for isolated Vercel domains.
7. Run release:
   `npm --workspace api run prisma:migrate:deploy && npm --workspace api run seed:system`

## Vercel Apps

Add these in each project:

- Web: values from `apps/web/.env.production.example`
- Admin: values from `apps/admin/.env.production.example`
- Landing: values from `apps/landing/.env.production.example`

Do not add API secrets or database URLs to Vercel frontend projects.

## Local Development

Create:

- `services/api/.env` from `services/api/.env.development.example`
- `apps/web/.env.local` from `apps/web/.env.local.example`
- `apps/admin/.env.local` from `apps/admin/.env.local.example`
- `apps/landing/.env.local` from `apps/landing/.env.local.example`
- `apps/agent-desktop/.env` from `apps/agent-desktop/.env.development.example`

## Verification

1. Visit `https://dijipeople.onrender.com/`, `/api`, and `/api/health`.
2. Run a CORS preflight from the admin origin and confirm `Access-Control-Allow-Credentials: true`.
3. Log into admin production and confirm `admin_access_token` and `admin_refresh_token` cookies exist.
4. Log into web production and confirm `web_access_token` and `web_refresh_token` cookies exist.
5. Confirm web cookies do not authenticate admin and admin cookies do not authenticate web.
6. Create tenant from customer onboarding.
7. Resend owner activation.
8. Open super admin dashboard summary.
9. Confirm activation/reset links use the web production URL.
10. Start agent desktop login/config/heartbeat against `https://dijipeople.onrender.com/api`.
