import { redirect } from "next/navigation";

export default function PayrollGlAccountsSettingsRedirect() {
  redirect("/settings/payroll/configuration/gl-accounts");
}
