import { redirect } from "next/navigation";

export default function BillingSuccessRedirectPage() {
  redirect("/settings/subscription/success");
}
