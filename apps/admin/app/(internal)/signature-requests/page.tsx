import type { Metadata } from "next";
import { RuntimeModulePage } from "@/app/_components/runtime/runtime-module-page";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Signature Requests",
};


/**
 * Third instance of the BUG-0019 pattern, found by the invariant written for the
 * first two rather than reported.
 *
 * This redirected to `/contracts?viewId=awaiting-external-signature`, a Contract
 * list, while the `signature-requests` module is defined over SignatureRequest
 * rows — recipients, expiry, completion — and `/signature-requests/[requestId]`
 * loads one by its own id. A Contract list cannot show a request that is
 * expiring, and its row ids do not resolve here.
 */
export default function Page() {
  return <RuntimeModulePage moduleKey="signature-requests" />;
}
