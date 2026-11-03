// Effective-authorization classification of a route (policy API-005).
//
// A route "without a visible @Permissions" is not necessarily unprotected:
// authorization may be in a guard (platform roles, machine tokens), in the
// service method the handler calls, or the route may be self-scoped. This
// traces handler -> injected service method -> same-class helpers (depth 2) and
// records WHAT matched and WHERE, so a reviewer can disprove a classification.
//
// Limits (stated, not hidden): regex over source, not a type-checked call
// graph. "SERVICE_ENFORCED_*" means an authorization call is reachable from the
// handler, not that it is correct or that it covers every branch.
import fs from 'node:fs';
import path from 'node:path';

const MACHINE_GUARDS = /^(GatewayAuthGuard|PartnerAuthGuard|AgentAuthGuard|PlatformAuthGuard|ServiceTokenGuard|WebhookSignatureGuard)$/;
const SENSITIVE_MODULES = new Set(['contracts', 'billing', 'payroll', 'payslips', 'auth', 'platform-users', 'platform-auth', 'tenant-control-plane', 'super-admin', 'compensation', 'loans', 'legal', 'permissions', 'roles', 'tenant-domains', 'partners', 'partner-experience']);

export const EVIDENCE = {
  platform: /\b(assertPlatform\w*|requirePlatform\w*|assertPlatformAdministrator|assertTenantPlatformAccess|userHasPlatformPermission|isPlatformUser|assertControlPlane\w*|assertCanonical\w*)\b|\.platform\b/,
  permission: /\b(permissionResolver|assertCan\w*|hasPermission|hasAnyPermission|userHasPermission|assert\w*Permission\w*|requireAccess|assertAccess|resolveEffectiveAccessLevel|buildScopedAccessWhere|hasElevatedTenantRole)\b|permissionKeys/,
  self: /\b(?:current)?[uU]ser\.userId\b|\buserId\b/,
  tenant: /\btenantId\b/,
};

const cache = new Map();
const read = (f) => (cache.has(f) ? cache.get(f) : (cache.set(f, fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : ''), cache.get(f)));

function injectedServices(controllerText, controllerFile) {
  const map = new Map();
  const imports = new Map();
  for (const m of controllerText.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g))
    for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())) imports.set(name, m[2]);
  for (const m of controllerText.matchAll(/(?:private|protected|public)\s+readonly\s+(\w+):\s*(\w+)/g)) {
    const spec = imports.get(m[2]);
    if (!spec?.startsWith('.')) continue;
    const base = path.resolve(path.dirname(controllerFile), spec);
    const file = [base + '.ts', path.join(base, 'index.ts')].find((f) => fs.existsSync(f));
    if (file) map.set(m[1], file);
  }
  return map;
}

function methodBody(text, name) {
  const re = new RegExp(`^ {2}(?:public\\s+|private\\s+|protected\\s+)?(?:async\\s+)?${name}\\s*[(<]`, 'm');
  const m = re.exec(text);
  if (!m) return '';
  // Skip the parameter list by paren matching: a parameter TYPE can contain "{".
  let k = text.indexOf('(', m.index);
  let paren = 0;
  for (; k < text.length; k++) {
    if (text[k] === '(') paren++;
    else if (text[k] === ')' && --paren === 0) break;
  }
  // The body "{" is the first one NOT inside a return-type literal: a type "{" follows
  // "<", ":", "," "|" "&" "(" or "=" (e.g. `): Promise<{ rows: X[] }> {`).
  let open = -1;
  let typeDepth = 0;
  for (let i = k + 1; i < text.length; i++) {
    if (text[i] === '{') {
      const prev = text.slice(k, i).trimEnd().slice(-1);
      if (typeDepth === 0 && !'<,|&:(=['.includes(prev)) {
        open = i;
        break;
      }
      typeDepth++;
    } else if (text[i] === '}' && typeDepth > 0) typeDepth--;
  }
  if (open < 0) return text.slice(m.index, k);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(m.index, i + 1);
  }
  return text.slice(m.index);
}

function reachable(text, name, depth = 2, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  const body = methodBody(text, name);
  if (!body || depth === 0) return body;
  const next = [...body.matchAll(/this\.(\w+)\(/g)].map((m) => m[1]);
  return [body, ...next.map((n) => reachable(text, n, depth - 1, seen))].join('\n');
}

export function authorizationContext(route, controllerText) {
  const services = injectedServices(controllerText, path.resolve(route.file));
  const calls = [...route.body.matchAll(/this\.(\w+)\.(\w+)\(/g)].map((m) => ({ prop: m[1], method: m[2] }));
  const traced = [];
  let serviceText = '';
  for (const c of calls) {
    const file = services.get(c.prop);
    if (!file) continue;
    const body = reachable(read(file), c.method);
    if (body) {
      traced.push(`${path.basename(file)}#${c.method}`);
      serviceText += '\n' + body;
    }
  }
  return { traced, text: `${route.body}\n${serviceText}` };
}

export function classifyRoute(route, controllerText) {
  const mutating = route.method !== 'GET';
  const module = route.file.split('/')[4];
  const sensitive = SENSITIVE_MODULES.has(module);
  const hasDecl = route.legacyPermission || route.matrixPermission || route.platformPermission;
  if (route.public) return { cls: 'PUBLIC_DECLARED', declared: true, why: '@Public()' };
  if (hasDecl) return { cls: 'PERMISSION_DECLARED', declared: true, why: '@Permissions/@RequirePermission/@RequirePlatformPermission' };
  if (route.decorators.includes('AuthenticationOnly')) return { cls: 'AUTHENTICATION_ONLY_DECLARED', declared: true, why: '@AuthenticationOnly() — reviewed marker' };
  if (route.decorators.includes('RequireRoles') && route.guardNames.includes('PlatformPermissionsGuard')) return { cls: 'PLATFORM_ROLE_GUARD', declared: true, why: 'PlatformPermissionsGuard + @RequireRoles' };
  const machine = route.guardNames.find((g) => MACHINE_GUARDS.test(g));
  if (machine && !route.guardNames.includes('JwtAuthGuard')) return { cls: 'MACHINE_OR_TOKEN_GUARD', declared: true, why: machine };
  if (route.guardNames.includes('PublicRateLimitGuard') && !route.guardNames.includes('JwtAuthGuard')) return { cls: 'RATE_LIMITED_PUBLIC', declared: true, why: 'PublicRateLimitGuard without JwtAuthGuard (public by design; token/body validated in handler)' };

  const ctx = authorizationContext(route, controllerText);
  const ev = Object.fromEntries(Object.entries(EVIDENCE).map(([k, re]) => [k, re.test(ctx.text)]));
  const base = { declared: false, traced: ctx.traced, evidence: Object.keys(ev).filter((k) => ev[k]), mutating, sensitive };
  if (ev.platform) return { ...base, cls: 'SERVICE_ENFORCED_PLATFORM', priority: 'P3', why: 'platform assertion reachable from handler' };
  if (ev.permission) return { ...base, cls: 'SERVICE_ENFORCED_PERMISSION', priority: 'P3', why: 'permission/scope check reachable from handler' };
  // Self-scoped = acts on the caller and addresses no other subject (no path parameter).
  if (ev.self && !route.path.includes(':')) return { ...base, cls: 'SELF_SCOPED', priority: 'P3', why: 'acts on the caller\'s own userId; no cross-user access seen' };
  if (ev.tenant) return { ...base, cls: 'TENANT_SCOPED_NO_ACTION_AUTHZ', priority: mutating || sensitive ? 'P1' : 'P2', why: 'any authenticated user of the tenant can reach this; no permission/platform check found' };
  return { ...base, cls: 'NO_AUTHZ_EVIDENCE', priority: 'P0', why: 'authenticated only; no tenant scoping, permission or platform check found from the handler' };
}
