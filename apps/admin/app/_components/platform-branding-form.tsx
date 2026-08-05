"use client";

import { Check, RotateCcw, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import {
  PLATFORM_THEME_PRESETS,
  appearanceForPreset,
  normalizePlatformAppearance,
  type PlatformAppearance,
  type PlatformThemePreset,
} from "@/lib/platform-appearance";

type Message = { tone: "success" | "error"; text: string };

export function PlatformBrandingForm({
  initialBranding,
}: {
  initialBranding: Partial<PlatformAppearance>;
}) {
  const { updateAppearance } = usePlatformDefaults();
  const [baseline, setBaseline] = useState(() =>
    normalizePlatformAppearance(initialBranding),
  );
  const [form, setForm] = useState(baseline);
  const [message, setMessage] = useState<Message | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasChanges = JSON.stringify(form) !== JSON.stringify(baseline);

  function selectPreset(preset: PlatformThemePreset) {
    setMessage(null);
    const next = appearanceForPreset(preset);
    setForm(next);
    updateAppearance(next);
  }

  function updateColor(key: keyof PlatformAppearance, value: string) {
    const next = { ...form, [key]: value };
    setMessage(null);
    setForm(next);
    if (/^#[0-9a-f]{6}$/i.test(value)) updateAppearance(next);
  }

  function reset() {
    setForm(baseline);
    updateAppearance(baseline);
    setMessage(null);
  }

  function save() {
    const normalized = normalizePlatformAppearance(form);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/super-admin/platform-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branding: normalized }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setMessage({
            tone: "error",
            text: payload?.message ?? "Unable to save the platform theme.",
          });
          return;
        }
        const saved = normalizePlatformAppearance(payload?.branding ?? normalized);
        setForm(saved);
        setBaseline(saved);
        updateAppearance(saved);
        setMessage({
          tone: "success",
          text: "Theme saved and applied across the admin workspace.",
        });
      } catch {
        setMessage({ tone: "error", text: "Network error. Theme was not saved." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {message ? (
        <AppNotification tone={message.tone}>{message.text}</AppNotification>
      ) : null}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Color theme</h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose a preset, then fine-tune its colors. The preview applies immediately.
            </p>
          </div>
          <span className="rounded-full bg-[var(--admin-surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--admin-primary)]">
            Live preview
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Theme presets">
          {PLATFORM_THEME_PRESETS.map((preset) => {
            const selected = form.themePreset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                aria-pressed={selected}
                onClick={() => selectPreset(preset.value)}
                className={`relative rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)] shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex -space-x-1">
                    {[preset.navigationColor, preset.primaryColor, preset.accentColor].map((color) => (
                      <span key={color} className="h-7 w-7 rounded-full border-2 border-white" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  {selected ? <Check className="h-4 w-4 text-[var(--admin-primary)]" /> : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-950">{preset.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ColorControl label="Primary actions" value={form.primaryColor} onChange={(value) => updateColor("primaryColor", value)} />
        <ColorControl label="Accent" value={form.accentColor} onChange={(value) => updateColor("accentColor", value)} />
        <ColorControl label="Navigation" value={form.navigationColor} onChange={(value) => updateColor("navigationColor", value)} />
        <ColorControl label="Page tint" value={form.surfaceTint} onChange={(value) => updateColor("surfaceTint", value)} />
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" disabled={isPending || !hasChanges} onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
        <button type="button" disabled={isPending || !hasChanges} onClick={save} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
          <Save className="h-4 w-4" /> {isPending ? "Saving..." : "Save theme"}
        </button>
      </div>
    </div>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2 text-sm font-medium text-slate-800">
      {label}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-11 cursor-pointer rounded-lg border-0 bg-transparent" />
        <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={7} className="min-w-0 flex-1 bg-transparent font-mono text-xs uppercase outline-none" />
      </div>
    </label>
  );
}
