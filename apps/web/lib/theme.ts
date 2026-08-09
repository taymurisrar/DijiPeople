/*
 * The user's light/dark choice, shared by the toggle and the app-wide applier.
 *
 * Kept in one place because the choice has to be applied from two directions:
 * a script that runs before paint so the page never flashes, and a component
 * that re-applies after hydration. The second is not belt-and-braces — a
 * hydration mismatch anywhere on the page makes React regenerate the tree from
 * the server HTML, which has no theme attribute, silently reverting the page to
 * light. Browser extensions that inject into the DOM cause exactly that.
 */

export const THEME_STORAGE_KEY = "dijipeople:theme";

export type ThemeChoice = "light" | "dark" | "system";

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function readStoredThemeChoice(): ThemeChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : null;
  } catch {
    /* Storage can be blocked; that is not a reason to fail. */
    return null;
  }
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* A blocked storage API must not stop the theme from changing. */
  }
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/**
 * Writes the resolved theme onto the document.
 *
 * The attribute lives on `<html>` because that is what the stylesheet keys on
 * and it is the one element that survives client-side navigation. Any
 * server-rendered wrapper still carrying its own `data-theme` is brought into
 * line so a stale tenant default cannot contradict the user's choice.
 */
export function applyTheme(choice: ThemeChoice): "light" | "dark" {
  const resolved = resolveTheme(choice);

  if (document.documentElement.dataset.theme !== resolved) {
    document.documentElement.dataset.theme = resolved;
  }

  document.querySelectorAll<HTMLElement>("[data-theme]").forEach((element) => {
    if (element !== document.documentElement) {
      element.dataset.theme = resolved;
    }
  });

  return resolved;
}
