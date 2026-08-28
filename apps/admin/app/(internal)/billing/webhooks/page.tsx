import { redirect } from "next/navigation";
import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Webhooks",
};


export default async function StripeWebhookEventsPage() {
  redirect("/billing?tab=webhooks");
}
