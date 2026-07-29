import { redirect } from "next/navigation";

export default function PayrollPostingRulesSettingsRedirect() {
  redirect("/settings/payroll/configuration/posting-rules");
}
