"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyTheme,
  readStoredThemeChoice,
  storeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

/*
 * Light / Dark / System for the signed-in user, on this device.
 *
 * Only reflects and records the choice — applying it is `ThemeApplier`'s job,
 * mounted once in the root layout. Keeping the two apart is what lets the theme
 * survive on pages this control is not on, and survive React regenerating the
 * tree after a hydration mismatch.
 */

type ThemeOption = {
  value: ThemeChoice;
  label: string;
  Icon: typeof Sun;
};

const OPTIONS: readonly ThemeOption[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [isReady, setIsReady] = useState(false);

  /*
   * Read after mount, never during render: the stored choice does not exist on
   * the server, and reading it while rendering is what produces a hydration
   * mismatch. `isReady` keeps every button unselected until then, so the first
   * client render matches the markup the server sent.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setChoice(readStoredThemeChoice() ?? "system");
    setIsReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function select(next: ThemeChoice) {
    setChoice(next);
    storeThemeChoice(next);
    applyTheme(next);
  }

  return (
    <div
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
      role="group"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = isReady && choice === value;
        return (
          <button
            aria-label={`${label} theme`}
            aria-pressed={isActive}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
              isActive
                ? "bg-accent text-white"
                : "text-muted hover:bg-muted/20 hover:text-foreground"
            }`}
            key={value}
            onClick={() => select(value)}
            suppressHydrationWarning
            title={`${label} theme`}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
