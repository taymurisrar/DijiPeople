"use client";

import { useSyncExternalStore } from "react";

type TokenGroup = {
  title: string;
  tokens: ReadonlyArray<readonly [string, string]>;
};

const GROUPS: TokenGroup[] = [
  {
    title: "Core colors",
    tokens: [
      ["Primary", "--admin-primary"],
      ["Primary hover", "--admin-primary-hover"],
      ["Accent", "--admin-accent"],
      ["Navigation", "--admin-navigation"],
      ["Background", "--admin-background"],
      ["Surface / card", "--admin-surface"],
      ["Surface tint", "--admin-surface-tint"],
      ["Border", "--admin-border"],
      ["Primary text", "--admin-text"],
      ["Muted text", "--admin-muted-text"],
      ["Success", "--admin-success"],
      ["Warning", "--admin-warning"],
      ["Danger", "--admin-danger"],
      ["Info", "--admin-info"],
    ],
  },
  {
    title: "Typography",
    tokens: [
      ["Primary UI font", "--admin-font-ui"],
      ["Heading font", "--admin-font-heading"],
      ["Base font size", "--admin-base-font-size"],
    ],
  },
  {
    title: "Shape and elevation",
    tokens: [
      ["Small radius", "--admin-radius-sm"],
      ["Medium radius", "--admin-radius-md"],
      ["Large radius", "--admin-radius-lg"],
      ["Workspace radius", "--admin-radius-xl"],
      ["Card shadow", "--admin-shadow-card"],
      ["Floating shadow", "--admin-shadow-floating"],
    ],
  },
];

export function DesignTokenInspector() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Fact label="Application" value="DijiPeople Platform Admin" />
        <Fact label="Appearance mode" value="Light only" />
        <Fact label="Theme source" value="Central CSS variables" />
      </div>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="text-sm font-semibold text-slate-950">
            {group.title}
          </h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {group.tokens.map(([label, variable]) => {
              const color = group.title === "Core colors";
              return (
                <div
                  key={variable}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  {color ? (
                    <span
                      className="h-9 w-9 shrink-0 rounded-lg border border-black/10"
                      style={{ background: `var(${variable})` }}
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700">
                      {label}
                    </span>
                    <code className="mt-0.5 block truncate text-[11px] text-slate-500">
                      <CssTokenValue variable={variable} />
                    </code>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function CssTokenValue({ variable }: { variable: string }) {
  const value = useSyncExternalStore(
    subscribeToThemeChanges,
    () => readCssToken(variable),
    () => "Loading…",
  );
  return value || "Not defined";
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  const target =
    document.querySelector(".admin-theme") ?? document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(target, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observer.disconnect();
}

function readCssToken(variable: string) {
  const target =
    document.querySelector(".admin-theme") ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue(variable).trim();
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
