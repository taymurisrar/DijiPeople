import { redirect } from "next/navigation";

export default function BillingSettingsRedirectPage() {
  redirect("/settings/subscription/overview");
}
