"use client";

import { useEffect, useState } from "react";

export type CountryOption = { id: string; code: string; name: string };

type State = {
  countries: CountryOption[];
  /** True until the first answer, success or failure. */
  loading: boolean;
  /**
   * The lookup could not be read. Deliberately not an error message shown to
   * the buyer: the field falls back to free text, which is what it was before,
   * so a lookup outage costs data quality and never a sale.
   */
  unavailable: boolean;
};

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
 * **It never blocks checkout.** If the request fails the caller falls back to a
 * text input. A buyer who cannot complete a purchase because a reference
 * lookup was slow is a far worse outcome than a country typed by hand.
 */
export function useCountryOptions(): State {
  const [state, setState] = useState<State>({
    countries: [],
    loading: true,
    unavailable: false,
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
        setState({
          countries: Array.isArray(countries) ? countries : [],
          loading: false,
          unavailable: false,
        });
      })
      .catch((reason: unknown) => {
        if (!active || (reason as { name?: string }).name === "AbortError") {
          return;
        }
        setState({ countries: [], loading: false, unavailable: true });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return state;
}
