# DijiPeople Environment Variables

Environment is app-scoped. Do not share cookies, JWT secrets, or app origins between `apps/web`, `apps/admin`, `apps/landing`, `apps/agent-desktop`, and `services/api`.

## Security Notes

- A Neon PostgreSQL connection string was previously exposed. Treat it as compromised.
- Rotate the production `DATABASE_URL` in Neon before the next production deploy.
- Store production database and JWT secrets only in Render/Vercel environment variables.
- Do not commit `.env` files containing real secrets.

## API: Render

Required production values:

```env
NODE_ENV=production
PORT=4000
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
DATABASE_URL=<rotated-neon-postgres-url>
CORS_ALLOWED_ORIGINS=https://diji-people-admin.vercel.app,https://diji-people-web.vercel.app,https://diji-people-landing.vercel.app
CORS_ALLOWED_HEADERS=Authorization,Content-Type,X-DijiPeople-App,X-DijiPeople-Client,X-Client-Id,X-Tenant-Slug,X-Requested-With,X-Trace-Id,X-Request-Id
CORS_ALLOWED_METHODS=GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
CORS_ALLOW_CREDENTIALS=true
ADMIN_APP_URL=https://diji-people-admin.vercel.app
WEB_APP_URL=https://diji-people-web.vercel.app
LANDING_APP_URL=https://diji-people-landing.vercel.app
ACCOUNT_ACTIVATION_LINK_BASE_URL=https://diji-people-web.vercel.app/account/activate
PASSWORD_RESET_LINK_BASE_URL=https://diji-people-web.vercel.app/auth/reset-password
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
ADMIN_COOKIE_DOMAIN=
WEB_COOKIE_DOMAIN=
ADMIN_ACCESS_TOKEN_COOKIE=admin_access_token
ADMIN_REFRESH_TOKEN_COOKIE=admin_refresh_token
WEB_ACCESS_TOKEN_COOKIE=web_access_token
WEB_REFRESH_TOKEN_COOKIE=web_refresh_token
AGENT_ACCESS_TOKEN_COOKIE=agent_access_token
AGENT_REFRESH_TOKEN_COOKIE=agent_refresh_token
```

JWT secrets must be at least 32 characters. Use different values for:

```env
JWT_ACCESS_SECRET=<global-fallback>
JWT_REFRESH_SECRET=<global-fallback>
ADMIN_JWT_ACCESS_SECRET=<admin-access-secret>
ADMIN_JWT_REFRESH_SECRET=<admin-refresh-secret>
WEB_JWT_ACCESS_SECRET=<web-access-secret>
WEB_JWT_REFRESH_SECRET=<web-refresh-secret>
AGENT_JWT_ACCESS_SECRET=<agent-access-secret>
AGENT_JWT_REFRESH_SECRET=<agent-refresh-secret>
AUTH_ACCESS_TOKEN_TTL_SECONDS=15m
AUTH_REFRESH_TOKEN_TTL_SECONDS=1h
AUTH_IDLE_SESSION_TIMEOUT_SECONDS=1h
AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h
AUTH_REFRESH_ROTATION_ENABLED=true
AUTH_AGENT_ACCESS_TOKEN_TTL_SECONDS=15m
AUTH_AGENT_REFRESH_TOKEN_TTL_SECONDS=30d
AUTH_AGENT_IDLE_SESSION_TIMEOUT_SECONDS=12h
AUTH_AGENT_ABSOLUTE_SESSION_TIMEOUT_SECONDS=30d
```

Email variables are required only when email delivery is enabled:

```env
ENABLE_EMAILS=true
ENABLE_NOTIFICATIONS=true
ENABLE_ACCOUNT_ACTIVATION_EMAIL=true
ENABLE_PASSWORD_RESET_EMAIL=true
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=DijiPeople
```

## Web: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-web.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
WEB_ACCESS_TOKEN_COOKIE=web_access_token
WEB_REFRESH_TOKEN_COOKIE=web_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=
SESSION_IDLE_TIMEOUT_SECONDS=3600
SESSION_ABSOLUTE_TIMEOUT_SECONDS=28800
SESSION_REFRESH_THRESHOLD_SECONDS=300
USE_ENTITY_DATA_API=true
EXPOSE_DEV_AUTH_LINKS=false
```

## Admin: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople Admin
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-admin.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
ADMIN_ACCESS_TOKEN_COOKIE=admin_access_token
ADMIN_REFRESH_TOKEN_COOKIE=admin_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=
SESSION_IDLE_TIMEOUT_SECONDS=3600
SESSION_ABSOLUTE_TIMEOUT_SECONDS=28800
SESSION_REFRESH_THRESHOLD_SECONDS=300
EXPOSE_DEV_AUTH_LINKS=false
```

## Landing: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-landing.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
```

## Agent Desktop

```env
NODE_ENV=production
AGENT_APP_NAME=DijiPeople Agent
AGENT_API_BASE_URL=https://dijipeople.onrender.com/api
AGENT_API_ORIGIN=https://dijipeople.onrender.com
AGENT_DEVICE_REGISTRATION_ENABLED=true
AGENT_ACCESS_TOKEN_TTL=15m
AGENT_REFRESH_TOKEN_TTL=30d
AGENT_SESSION_IDLE_TIMEOUT_SECONDS=43200
AGENT_SESSION_ABSOLUTE_TIMEOUT_SECONDS=2592000
AGENT_SESSION_REFRESH_THRESHOLD_SECONDS=300
AGENT_HEARTBEAT_INTERVAL_SECONDS=60
AGENT_HEARTBEAT_BATCH_SIZE=1000
AGENT_OFFLINE_QUEUE_ENABLED=true
AGENT_OFFLINE_QUEUE_MAX_ITEMS=5000
DIJIPEOPLE_AGENT_UPDATE_URL=https://dijipeople.onrender.com/api/agent/updates
AGENT_AUTO_UPDATE_ENABLED=true
```

## Troubleshooting

- `INVALID_CREDENTIALS` from web but not admin: verify `NEXT_PUBLIC_API_BASE_URL`, tenant slug/header behavior, and that the web user belongs to the expected tenant and is active.
- `AUTH_REQUIRED` after admin onboarding: verify admin cookies are `admin_access_token` and `admin_refresh_token`, host-only, Secure on HTTPS, and API requests include `X-DijiPeople-App: admin`.
- CORS failure: `CORS_ALLOWED_ORIGINS` must contain origins only, no `/api`, and never `*` when credentials are enabled.
- Cookie missing in browser devtools: Vercel apps on separate domains should use host-only cookies with empty `COOKIE_DOMAIN`.
