import { request, type APIRequestContext } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { assessSafety } from './safety';

/**
 * Role-scoped API access to a Growth-plan tenant, for workflow tests.
 *
 * Why API-level actors at all, when the point of browser E2E is the UI: a real
 * workflow here crosses people — a recruiter moves a candidate, an admin
 * converts them, an employee asks for leave and a manager decides. Driving each
 * hand-off through a browser would make every test depend on four sign-ins and
 * the login throttle (20 per 10 minutes). The actors below sign in once per
 * role per run; the UI assertions that matter then use one browser session.
 *
 * **No skipping.** The older flows skip with a named reason when the
 * environment is absent. For the Growth workflows that is the wrong default: a
 * suite that quietly runs nothing reads as green. `requireGrowthEnvironment`
 * throws instead, so a missing environment is a red run with a message.
 */

export type Role =
  | 'system-admin'
  | 'ceo'
  | 'hr'
  | 'recruiter'
  | 'manager'
  | 'employee'
  | 'payroll';

export type ApiResult<T = unknown> = {
  status: number;
  body: T;
  /** Validation or domain message(s), joined, when the API sent one. */
  message: string;
};

export type Actor = {
  role: Role;
  userId: string;
  permissionKeys: string[];
  get<T = unknown>(path: string): Promise<ApiResult<T>>;
  post<T = unknown>(path: string, data?: unknown): Promise<ApiResult<T>>;
  patch<T = unknown>(path: string, data?: unknown): Promise<ApiResult<T>>;
  del<T = unknown>(path: string): Promise<ApiResult<T>>;
  upload<T = unknown>(
    path: string,
    fields: Record<string, string>,
    file: { name: string; mimeType: string; buffer: Buffer },
  ): Promise<ApiResult<T>>;
};

export function growthConfig() {
  const slug = process.env.E2E_TENANT_SLUG?.trim() || 'dijipeople-demo';
  const password = process.env.E2E_TENANT_USER_PASSWORD;
  // Role users are `<role>@dijipeople.local` in seed-demo. Overridable for a
  // differently seeded environment, but never defaulted for the password.
  const domain = process.env.E2E_TENANT_USER_DOMAIN?.trim() || 'dijipeople.local';
  return { slug, password, domain, api: `${BASE_URLS.api}/api` };
}

/**
 * One tag for the whole run. Every row a flow creates carries it, so residue can
 * be counted and, where the API has no delete route, removed by tag.
 */
export const RUN_TAG = `qa${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Throws (never skips) when the Growth workflow environment is not usable, and
 * refuses outright when it is not a disposable local stack. The safety check
 * runs before the first sign-in, so a wrong URL costs nothing.
 */
export async function requireGrowthEnvironment(): Promise<void> {
  const { password, api } = growthConfig();
  if (!password) {
    throw new Error(
      'E2E_TENANT_USER_PASSWORD is unset. The Growth workflow suite does not skip: set it to the seeded role-user password.',
    );
  }

  // Cheap, side-effect-free: the health endpoint says what the API is.
  const probe = await request.newContext();
  let apiEnvironment: string | null = null;
  try {
    const response = await probe.get(`${api}/health`).catch(() => null);
    if (!response?.ok()) {
      throw new Error(`API not reachable at ${api}/health`);
    }
    apiEnvironment =
      ((await response.json().catch(() => null)) as { environment?: string } | null)
        ?.environment ?? null;
  } finally {
    await probe.dispose();
  }

  const verdict = assessSafety({
    urls: {
      api: BASE_URLS.api,
      web: BASE_URLS.web,
      admin: BASE_URLS.admin,
      landing: BASE_URLS.landing,
    },
    databaseUrl: process.env.E2E_DATABASE_URL,
    apiEnvironment,
  });
  if (!verdict.safe) {
    throw new Error(
      [
        'REFUSING TO RUN: these flows write and delete data and must only run against a disposable local stack.',
        ...verdict.reasons.map((reason) => `  - ${reason}`),
      ].join(String.fromCharCode(10)),
    );
  }
}

const actors = new Map<Role, Promise<Actor>>();

/** One sign-in per role per run. */
export function actor(role: Role): Promise<Actor> {
  let existing = actors.get(role);
  if (!existing) {
    existing = createActor(role);
    actors.set(role, existing);
  }
  return existing;
}

async function createActor(role: Role): Promise<Actor> {
  const { slug, password, domain, api } = growthConfig();
  const context: APIRequestContext = await request.newContext();
  const login = await context.post(`${api}/auth/login`, {
    headers: { 'X-DijiPeople-App': 'web' },
    data: { email: `${role}@${domain}`, password, tenantSlug: slug },
  });
  if (!login.ok()) {
    throw new Error(
      `sign-in as ${role} failed with ${login.status()} (a 429 means the login throttle — restart the API or wait 10 minutes)`,
    );
  }
  const session = (await login.json()) as {
    tokens: { accessToken: string };
    user: { userId: string; permissionKeys: string[] };
  };
  const headers = {
    'X-DijiPeople-App': 'web',
    Authorization: `Bearer ${session.tokens.accessToken}`,
  };

  async function send<T>(
    run: () => ReturnType<APIRequestContext['get']>,
  ): Promise<ApiResult<T>> {
    const response = await run();
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* binary or empty body */
    }
    const raw = (body as { message?: string | string[] } | null)?.message;
    return {
      status: response.status(),
      body: body as T,
      message: Array.isArray(raw) ? raw.join(' | ') : (raw ?? ''),
    };
  }

  return {
    role,
    userId: session.user.userId,
    permissionKeys: session.user.permissionKeys,
    get: (path) => send(() => context.get(`${api}/${path}`, { headers })),
    post: (path, data) =>
      send(() => context.post(`${api}/${path}`, { headers, data })),
    patch: (path, data) =>
      send(() => context.patch(`${api}/${path}`, { headers, data })),
    del: (path) => send(() => context.delete(`${api}/${path}`, { headers })),
    upload: (path, fields, file) =>
      send(() =>
        context.post(`${api}/${path}`, {
          headers,
          multipart: { ...fields, file },
        }),
      ),
  };
}

/** The `items` of a paged response, or the array itself. */
export function rows<T = Record<string, unknown>>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const items = (body as { items?: T[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

/** A short unique suffix so a run never collides with its own earlier data. */
export function unique(): string {
  return `${RUN_TAG}${Math.random().toString(36).slice(2, 4)}`;
}

/** An ISO date `days` from today. */
export function isoDay(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
