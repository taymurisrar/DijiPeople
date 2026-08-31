"use client";

import { useMemo } from "react";
import type { ResolvedFormattingContext } from "@/lib/formatting-context";
import { useOptionalSystemPreferences } from "@/app/(authenticated)/_components/resolved-settings-provider";

/**
 * The tenant's formatting context, safe to use during render.
 *
 * `lib/formatting-context.ts` keeps a module-level default so a bare
 * `formatDate(x)` inherits the tenant's settings — but that default is
 * installed by an effect in `SystemPreferencesProvider`, and effects do not run
 * during server rendering. A client component that formats a date while
 * rendering therefore produced the fallback on the server ("Aug 31, 2026") and
 * the tenant's own format on the client ("08/31/2026"). React saw the two
 * disagree, threw a hydration mismatch, discarded the tree, and the app's error
 * boundary showed the user an "Unexpected error" dialog on a page that had
 * nothing wrong with it.
 *
 * The provider's *value* is available during SSR — it is a `useMemo` over the
 * settings the server passed in — so reading it here and passing it explicitly
 * makes both render passes agree.
 *
 * Use this in any client component that formats a date, time, number or amount
 * during render. Returns `null` outside the authenticated shell, which every
 * formatter already accepts.
 */
export function useFormattingContext(): ResolvedFormattingContext | null {
  const preferences = useOptionalSystemPreferences();

  return useMemo(() => {
    if (!preferences) return null;
    return {
      timezone: preferences.timezone,
      locale: preferences.locale,
      currency: preferences.currency,
      dateFormat: preferences.dateFormat,
      timeFormat: preferences.timeFormat,
      numberFormat: preferences.numberFormat,
    };
  }, [preferences]);
}
