"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureReferralCodeFromUrl } from "@/lib/referral";

/**
 * Remember `?ref=` wherever a partner's link happens to land.
 *
 * Mounted in the root layout because a referral link can point at any page —
 * the home page, a plan, a feature tour — and the code has to survive from
 * there to whichever form the visitor eventually submits.
 *
 * It used to be captured in a `useEffect` inside the *lead form*, which only
 * runs when that form is on screen. A visitor who followed a partner link and
 * went straight to Plans → Subscribe never mounted it, so their purchase was
 * recorded as an unattributed direct sale and the partner earned nothing.
 * BUG-0281.
 *
 * Renders nothing. `usePathname`/`useSearchParams` are read so the effect runs
 * again on client-side navigation, which App Router does not otherwise re-fire
 * for a layout-level component.
 */
export function ReferralCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    captureReferralCodeFromUrl();
  }, [pathname, searchParams]);

  return null;
}
