import { loadQaEnv } from './env';
import { Client } from 'pg';
import { env } from './test';

/**
 * Local-only helpers for scenarios that need what a browser or the public API cannot show:
 *  - `mail`: the local SMTP sink (e2e/golive/tools/mail-sink.cjs, 127.0.0.1:8025). Nothing is ever relayed.
 *  - `sql`:  the throwaway QA database, for fixtures (e.g. aging a session) and persisted-state assertions. Refuses non-test DBs.
 */
const SINK = (loadQaEnv() as unknown as Record<string, string | undefined>).QA_MAIL_URL ?? 'http://127.0.0.1:8025'; // QA_MAIL_URL lets RUN-005 use a sink on its own port beside other sessions' sinks

export type SinkMessage = { id: number; to: string[]; from: string; subject: string; text: string; html: string; links: string[]; receivedAt: string };

export const mail = {
  async clear() { await fetch(`${SINK}/messages`, { method: 'DELETE' }); },
  async list(to?: string): Promise<SinkMessage[]> { return (await fetch(`${SINK}/messages${to ? `?to=${encodeURIComponent(to)}` : ''}`)).json(); },
  /** Poll until a message to `to` (optionally matching `subject`) arrives; returns the newest one. */
  async waitFor(to: string, subject?: RegExp, timeoutMs = 20_000): Promise<SinkMessage> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const hit = (await this.list(to)).filter((m) => !subject || subject.test(m.subject)).pop();
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`no mail to ${to}${subject ? ` matching ${subject}` : ''} within ${timeoutMs} ms (sink has ${(await this.list()).length} messages)`);
      await new Promise((r) => setTimeout(r, 500));
    }
  },
  /** First link of the message whose URL carries a `token=` parameter, returned as the raw token. */
  token(m: SinkMessage): string {
    const link = m.links.find((l) => /[?&]token=/.test(l));
    if (!link) throw new Error(`no token link in "${m.subject}": ${m.links.join(' ')}`);
    return decodeURIComponent(new URL(link).searchParams.get('token')!);
  },
};

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const url = env.QA_DATABASE_URL;
  if (!/@localhost[:/]/.test(url) || !/_(test|ci|scratch|tmp|ephemeral)/.test(url)) throw new Error('sql(): refusing a non-local or non-test database');
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(query, params)).rows as T[]; } finally { await c.end().catch(() => undefined); }
}
