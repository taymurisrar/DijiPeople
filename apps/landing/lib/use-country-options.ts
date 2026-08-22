"use client";

import { useEffect, useState } from "react";

import { COUNTRY_OPTIONS } from "./acquisition-options";

export type CountryOption = { id: string; code: string; name: string };

/** Where the list currently on screen came from. */
export type CountrySource = "lookup" | "bundled";

type State = {
  /** Never empty — see `BUNDLED_COUNTRIES`. */
  countries: CountryOption[];
  /** True until the first answer, success or failure. */
  loading: boolean;
  source: CountrySource;
};

/**
 * The shortlist that ships with the bundle.
 *
 * The field was reported as "still not a lookup" after it had been changed into
 * one, and the reason is the whole point of this constant: the previous version
 * fell back to a **text input** when `/public/geography/countries` could not be
 * read, and an API process that has not restarted since that endpoint was added
 * answers 404. The fallback was silent, so the field looked exactly as it had
 * before the change — which is indistinguishable from the change never having
 * shipped.
 *
 * A reference lookup being unreachable is not a reason to degrade the control.
 * This is the same list `COUNTRY_OPTIONS` already gives the contact and partner
 * forms, so the buyer always has a list to choose from, and a successful
 * request only ever *widens* it to the full ISO set the `Country` table holds.
 *
 * `OTHER` is dropped deliberately: "Somewhere else" is a fine answer to "where
 * did you hear about us", and a corrupt value for a column meant to hold a
 * country.
 */
export const BUNDLED_COUNTRIES: CountryOption[] = COUNTRY_OPTIONS.filter(
  (option) => option.value !== "OTHER",
).map((option) => ({
  id: `bundled:${option.value}`,
  code: option.value,
  name: option.label,
}));

/**
 * The countries this platform recognises, from the list that is actually real.
 *
 * The subscribe wizard used to render Country as a free-text input, so
 * "UAE", "U.A.E." and "United Arab Emirates" all became customer records and no
 * report could tell they were the same place. `apps/landing` and `apps/admin`
 * each also carried a hardcoded list, giving three answers to the same
 * question.
 *
 * `/public/geography/countries` is the read-only projection of the `Country`
 * table — 250 rows, refreshed from an ISO source — and is the one both apps
 * now read.
 *
 * **It never blocks checkout, and it never stops being a list.** If the request
 * fails, the bundled shortlist stands in. A buyer who cannot complete a
 * purchase because a reference lookup was slow is a far worse outcome than a
 * buyer offered thirty-one countries instead of two hundred and fifty.
 */
export function useCountryOptions(): State {
  const [state, setState] = useState<State>({
    countries: BUNDLED_COUNTRIES,
    loading: true,
    source: "bundled",
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch("/api/public/geography/countries", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as CountryOption[];
      })
      .then((countries) => {
        if (!active) return;
        // An empty 200 is an outage wearing a success code. Keep the bundle.
        const usable = Array.isArray(countries) && countries.length > 0;
        setState({
          countries: usable ? countries : BUNDLED_COUNTRIES,
          loading: false,
          source: usable ? "lookup" : "bundled",
        });
      })
      .catch((reason: unknown) => {
        if (!active || (reason as { name?: string }).name === "AbortError") {
          return;
        }
        setState({
          countries: BUNDLED_COUNTRIES,
          loading: false,
          source: "bundled",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return state;
}
