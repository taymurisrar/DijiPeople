import { redirect } from "next/navigation";

export default function SubscriptionIndexPage() {
  redirect("/settings/subscription/overview");
}
