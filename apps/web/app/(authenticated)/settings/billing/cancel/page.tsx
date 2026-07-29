import { redirect } from "next/navigation";

export default function BillingCancelRedirectPage() {
  redirect("/settings/subscription/cancel");
}
