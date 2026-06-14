# Seed Architecture

## Commands

Run from the repository root:

```bash
npm run seed:admin
npm run seed:config
npm run seed:demo
npm run seed:all
npm run seed:demo:reset
npm run seed:demo:reseed
```

`seed:all` always runs in this order:

1. `seed:admin`
2. `seed:config`
3. `seed:demo`

The specialized payroll validation fixture remains available through
`npm run seed:payroll-flow` and is intentionally excluded from `seed:all`.

## Responsibilities

### Admin seed

`seed:admin` creates or updates only the Admin App platform super admin. It
does not create tenants, tenant users, employees, or demo data.

Required variables:

```dotenv
PLATFORM_SUPER_ADMIN_EMAIL=admin@example.com
PLATFORM_SUPER_ADMIN_PASSWORD=use-a-strong-password
PLATFORM_SUPER_ADMIN_FIRST_NAME=Platform
PLATFORM_SUPER_ADMIN_LAST_NAME=Administrator
```

The password must be at least 12 characters and is hashed with bcrypt.
`BOOTSTRAP_ADMIN_*` names remain accepted as temporary compatibility aliases.

### Config seed

`seed:config` creates production-safe application configuration for all
existing tenants: permissions, roles, RBAC mappings, project-role lookups,
notification/email foundations, leave types, and customization metadata.
Running it repeatedly is safe.

`seed:system` is retained as a deprecated alias.

### Demo seed

`seed:demo` owns one demo tenant and its customer account. Both roots are tagged
with `isDemoData`, `demoBatchId`, and `seedSource=seed-demo`. A
`DemoSeedBatch` row records each run.

Optional variables:

```dotenv
DEMO_TENANT_NAME=DijiPeople Demo Company
DEMO_TENANT_SLUG=dijipeople-demo
DEMO_TENANT_CONTACT_EMAIL=demo@example.com
DEMO_USER_PASSWORD=use-a-strong-demo-password
```

The seed refuses to reuse a slug owned by non-demo data.

## Demo deletion

CLI reset deletes the tagged tenant first, allowing tenant-owned records to
cascade safely, then deletes the matching tagged customer account. Deletion is
blocked if the root ownership tags do not match.

The Admin App page is available at:

```text
/settings/demo-data
```

It is restricted to platform super admins. Mutating actions additionally
require:

```dotenv
ENABLE_DEMO_DATA_RESET=true
```

The user must type `DELETE DEMO DATA` before Delete or Recreate is enabled.
Every API deletion writes a `PlatformAuditLog` entry.

Keep `ENABLE_DEMO_DATA_RESET=false` in normal production environments.

## Troubleshooting

- Missing admin password: set `PLATFORM_SUPER_ADMIN_PASSWORD` to at least 12
  characters.
- Demo slug conflict: choose another `DEMO_TENANT_SLUG`; the seed never takes
  ownership of an untagged tenant.
- Reset disabled: set `ENABLE_DEMO_DATA_RESET=true` on the API and restart it.
- Config missing on a new tenant: run `npm run seed:config`; demo seeding also
  applies required config to its own newly created tenant.
