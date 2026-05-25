import { redirect } from "next/navigation";

export default async function StripeWebhookEventsPage() {
  redirect("/billing?tab=webhooks");
}
