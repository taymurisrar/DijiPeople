import { redirect } from "next/navigation";

export default function LegacyNewLeavePolicyPage() {
  redirect("/settings/people/leave/leave-policies/new");
}
