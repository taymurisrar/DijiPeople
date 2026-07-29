import { redirect } from "next/navigation";

export default function TaxRulesSettingsRedirect() {
  redirect("/settings/payroll/configuration/tax-rules");
}
