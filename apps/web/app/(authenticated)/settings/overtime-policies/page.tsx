import { redirect } from "next/navigation";

export default function OvertimePoliciesSettingsRedirect() {
  redirect("/settings/payroll/configuration/overtime-policies");
}
