import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type QaEnv = Record<
  | 'QA_WEB_URL' | 'QA_API_URL' | 'QA_TENANT_SLUG' | 'QA_DATABASE_URL' | 'QA_PASSWORD'
  | 'QA_ADMIN_EMAIL' | 'QA_HR_EMAIL' | 'QA_MANAGER_EMAIL' | 'QA_EMPLOYEE_EMAIL'
  | 'QA_PAYROLL_EMAIL' | 'QA_RECRUITER_EMAIL',
  string
>;

export const ROLES = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

const LOCAL = /^https?:\/\/([a-z0-9-]+\.)?(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Reads `.env.qa.local` (gitignored) and the process environment. Fails closed:
 * the suite refuses to run unless the target is localhost and the database name
 * carries a test marker, so it can never be pointed at a shared or production
 * stack by a stray variable.
 */
export function loadQaEnv(): QaEnv {
  const file = join(__dirname, '..', '..', '..', '.env.qa.local');
  const fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      fromFile[line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1);
    }
  }
  const env = { ...fromFile, ...process.env } as unknown as QaEnv;
  for (const key of ['QA_WEB_URL', 'QA_API_URL', 'QA_TENANT_SLUG', 'QA_PASSWORD'] as const) {
    if (!env[key]) throw new Error(`Missing ${key}. See docs/qa/go-live/QA-RUNBOOK.md (copy the variable names into .env.qa.local).`);
  }
  if (!LOCAL.test(env.QA_WEB_URL) || !LOCAL.test(env.QA_API_URL)) {
    throw new Error('Refusing to run: QA_WEB_URL and QA_API_URL must be localhost.');
  }
  if (env.QA_DATABASE_URL && !/localhost/.test(env.QA_DATABASE_URL)) throw new Error('Refusing: QA_DATABASE_URL is not local.');
  if (env.QA_DATABASE_URL && !/_(test|ci|scratch|tmp|ephemeral)\b/.test(env.QA_DATABASE_URL)) {
    throw new Error('Refusing: QA_DATABASE_URL has no test marker.');
  }
  return env;
}

export const roleEmail = (env: QaEnv, role: Role) => env[`QA_${role}_EMAIL` as keyof QaEnv];

