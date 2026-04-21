# AGENTS.md

## Project
DijiPeople is a multi-tenant SaaS HRM platform for small to medium businesses, clinics, and hospitals in the US.

This product is being built as a configurable SaaS platform, not as a one-off custom client solution.

## Product goals
- Single codebase serving multiple tenants
- Strong tenant isolation
- Configurable modules, roles, permissions, policies, and workflows
- Scalable and reliable architecture
- Clean, maintainable, production-grade code
- Modular monolith first, not microservices

## Tech stack
- Monorepo: Turborepo
- Frontend: Next.js App Router + TypeScript + Tailwind CSS
- Backend: NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Auth: JWT access token + refresh token
- Queue/jobs: Redis + BullMQ later
- Billing: Stripe later
- Storage: S3 or Cloudflare R2 later
- Monitoring: Sentry later

## Repository structure
- apps/web -> tenant-facing application
- apps/admin -> super admin SaaS control panel
- services/api -> backend API
- packages/database -> shared database and prisma-related code
- packages/types -> shared TypeScript types
- packages/utils -> shared utility functions
- packages/config -> shared configuration
- packages/ui -> shared UI components

## Architecture rules
- Build a modular monolith, not microservices
- Keep backend modules isolated and cohesive
- Prefer explicit business-oriented naming
- Avoid premature abstraction
- Avoid tutorial-style code
- Code must be production-oriented and extensible
- Do not hardcode client-specific behavior
- Prefer configuration-driven design for anything tenant-specific

## Multi-tenant rules
- Every tenant-owned entity must include `tenantId`
- All queries for tenant-owned data must enforce tenant scoping
- Never allow cross-tenant reads or writes
- Tenant creation and first admin user creation should be transactional
- Design for one user belonging to one tenant for now
- Future support for multi-tenant users can be added later if needed

## Core backend foundation scope
Current priority is only the platform foundation, not full HR modules.

Build these first:
1. Tenant entity
2. User entity
3. Auth (signup, login, refresh token)
4. Role + permission system

Do not build advanced modules yet like:
- payroll
- recruitment
- attendance
- leave
- performance
- analytics
unless explicitly requested later

## Data modeling rules
- Use PostgreSQL-friendly schema design
- Use Prisma for schema and migrations
- Include `id`, `createdAt`, `updatedAt` on all primary entities
- Include `tenantId` on all tenant-owned entities
- Add indexes and unique constraints where sensible
- Store passwords hashed
- Store refresh tokens hashed, never plain text
- Use explicit relation names where needed to avoid ambiguity
- Keep schema ready for future expansion into employee, leave, attendance, payroll, and recruitment modules

## Auth rules
- Use JWT access and refresh token flow
- Passwords must be hashed securely
- Refresh tokens should be persisted hashed
- Auth payload should include at least:
  - userId
  - tenantId
  - email
- Protected routes must use guards
- Add a current-user decorator for authenticated requests

## RBAC rules
- Use proper RBAC with:
  - Role
  - Permission
  - UserRole
  - RolePermission
- Do not use simplistic `isAdmin`-style authorization
- Prefer permission-based checks over role-only checks
- Permission naming should follow a consistent convention:
  - users.read
  - users.create
  - users.update
  - users.delete
  - roles.read
  - roles.assign
  - employees.read
  - leaves.approve

## NestJS coding rules
- Organize code under `src/modules`
- Use DTOs with class-validator and class-transformer
- Use guards for auth and permission checks
- Keep controllers thin
- Keep services focused on business logic
- Keep persistence concerns separate and clean
- Use transactions when multiple dependent writes must succeed together
- Add common utilities, decorators, and guards under `src/common`

## Frontend rules
After backend foundation is complete, build:
1. Login page
2. Protected routes
3. Basic dashboard shell

Frontend rules:
- Use Next.js App Router
- Keep UI clean and minimal at first
- Do not overbuild design
- Focus on auth flow and app shell before feature pages
- Keep structure extensible for future modules

## Coding standards
- Use strict TypeScript
- Keep naming consistent
- Prefer simple, readable code
- Add comments only where they add value
- Do not leave dead code
- Avoid duplication
- Keep changes scoped to the current task
- Explain what files are added or changed when completing tasks

## Implementation workflow
When working on a task:
1. Understand current scope
2. Make only the requested changes
3. Preserve architecture consistency
4. Keep changes easy to extend later
5. Avoid introducing unrelated features
6. Summarize what changed and why

## Current success criteria
Phase 1 is successful when:
- Prisma schema exists for tenant/user/auth/rbac foundation
- Migration runs successfully
- Tenant signup creates tenant + first admin user
- Login returns access + refresh tokens
- Refresh flow works
- Auth guard works
- RBAC foundation works
- Frontend login page works
- Protected dashboard route works