'use client';

import { useState } from 'react';

type Health = {
  completenessPercentage: number;
  ready: boolean;
  checks: Array<{ label: string; ready: boolean }>;
  missing: string[];
};

export function PayrollSetupHealth({
  canInitialize,
  initialHealth,
}: {
  canInitialize: boolean;
  initialHealth: Health;
}) {
  const [health, setHealth] = useState(initialHealth);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function initialize() {
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/payroll/configuration/initialize-defaults', {
      method: 'POST',
    });
    const body = (await response.json().catch(() => null)) as
      | { health?: Health; created?: string[]; skipped?: string[]; message?: string }
      | null;
    setBusy(false);
    if (!response.ok || !body?.health) {
      setMessage(body?.message ?? 'Unable to initialize payroll defaults.');
      return;
    }
    setHealth(body.health);
    setMessage(
      `${body.created?.length ?? 0} defaults created; ${body.skipped?.length ?? 0} existing records preserved.`,
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Configuration health
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {health.completenessPercentage}%
          </p>
        </div>
        {canInitialize ? (
          <button
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={initialize}
            type="button"
          >
            {busy ? 'Initializing…' : 'Initialize missing defaults'}
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {health.checks.map((check) => (
          <div
            className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm"
            key={check.label}
          >
            <span aria-hidden className={check.ready ? 'text-success' : 'text-warning'}>
              {check.ready ? '✓' : '•'}
            </span>
            <span>{check.label}</span>
          </div>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
