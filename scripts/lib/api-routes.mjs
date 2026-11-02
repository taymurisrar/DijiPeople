// Static route extraction for NestJS controllers.
//
// Why static: the API cannot be booted in every context that needs this answer
// (pre-commit, a bare CI runner without a database). The runtime remains the
// authority for wiring (`wiring-invariants.spec.ts`); this reads only what the
// decorators say, so it can prove a route is *declared* with guards and
// permissions, never that it works.
import fs from 'node:fs';
import path from 'node:path';

const ROUTE_RE = /^\s*@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/;
const SIGNATURE_RE = /^ {2}(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*[(<]/;

export function controllerFiles(modulesDir) {
  const out = [];
  for (const mod of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!mod.isDirectory()) continue;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.controller.ts')) out.push(p);
      }
    };
    walk(path.join(modulesDir, mod.name));
  }
  return out.sort();
}

function stringArg(raw) {
  const m = /['"`]([^'"`]*)['"`]/.exec(raw ?? '');
  return m ? m[1] : '';
}

function joinPath(...parts) {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

export function parseController(file, text = fs.readFileSync(file, 'utf8')) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  // Anchor on @Controller: a controller file may declare DTO classes first.
  const ctrlLine = lines.findIndex((l) => /^@Controller\(/.test(l));
  if (ctrlLine < 0) return [];
  const classLine = lines.findIndex((l, n) => n >= ctrlLine && /^export\s+(abstract\s+)?class\s/.test(l));
  if (classLine < 0) return [];
  // Class decorators: the contiguous block above `export class`.
  let start = classLine;
  while (start > 0 && !/^\s*(\}|import\s|$)/.test(lines[start - 1]) && !/;\s*$/.test(lines[start - 1])) start--;
  const classDeco = lines.slice(start, classLine).join('\n');
  const ctrl = /@Controller\(([^)]*)\)/.exec(classDeco);
  const base = ctrl ? stringArg(ctrl[1]) : '';
  const classGuarded = /@UseGuards\(/.test(classDeco);
  const classPublic = /@Public\(\)/.test(classDeco);
  const classPerm = /@Permissions\(|@RequirePermission\(/.test(classDeco);

  const routes = [];
  for (let i = classLine + 1; i < lines.length; i++) {
    const m = ROUTE_RE.exec(lines[i]);
    if (!m) continue;
    // decorators above (until a closing brace at method indent)
    let a = i;
    while (a > classLine + 1 && !/^ {2}\}\s*$/.test(lines[a - 1]) && lines[a - 1].trim() !== '') a--;
    let j = i + 1;
    while (j < lines.length && !SIGNATURE_RE.test(lines[j])) j++;
    const deco = lines.slice(a, j).join('\n');
    const sig = SIGNATURE_RE.exec(lines[j] ?? '');
    const sub = stringArg(m[2]);
    routes.push({
      file,
      handler: sig ? sig[1] : '?',
      method: m[1].toUpperCase(),
      path: joinPath(base, sub),
      subPath: sub,
      line: i + 1,
      public: classPublic || /@Public\(\)/.test(deco),
      guarded: classGuarded || /@UseGuards\(/.test(deco),
      jwtGuarded: /@UseGuards\([^)]*JwtAuthGuard/.test(classDeco + deco),
      legacyPermission: classPerm && /@Permissions\(/.test(classDeco) || /@Permissions\(/.test(deco),
      matrixPermission: /@RequirePermission\(/.test(classDeco) || /@RequirePermission\(/.test(deco),
      platformPermission: /@RequirePlatformPermission\(/.test(classDeco + deco),
      platformGuard: /PlatformAuthGuard|PlatformPermissionsGuard|@PlatformPermissions/.test(classDeco + deco),
    });
  }
  return routes;
}

/** Classify the verb+shape of a route against the standard resource lifecycle. */
export function operationOf(route) {
  const sub = route.subPath;
  const isId = /^:\w+$/.test(sub);
  if (route.method === 'POST' && sub === '') return 'create';
  if (route.method === 'GET' && sub === '') return 'list';
  if (route.method === 'GET' && isId) return 'get';
  if ((route.method === 'PATCH' || route.method === 'PUT') && isId) return 'update';
  if (route.method === 'DELETE' && isId) return 'delete';
  if (route.method === 'POST' && /^:\w+\/restore$/.test(sub)) return 'restore';
  if (/bulk/.test(sub)) return 'bulk';
  if (/export/.test(sub)) return 'export';
  if (/import/.test(sub)) return 'import';
  return 'action';
}

export function scanApi(repoRoot) {
  const modulesDir = path.join(repoRoot, 'services/api/src/modules');
  const controllers = [];
  for (const file of controllerFiles(modulesDir)) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    const routes = parseController(file).map((r) => ({ ...r, file: rel, op: operationOf(r) }));
    controllers.push({ file: rel, module: rel.split('/')[4], routes });
  }
  return controllers;
}
