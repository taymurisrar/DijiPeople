import { redirect } from "next/navigation";

export default function FeatureAccessRedirectPage() {
  redirect("/settings/subscription/plans");
}
