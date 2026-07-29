import { redirect } from "next/navigation";

export default function ClaimTypesSettingsRedirect() {
  redirect("/settings/payroll/configuration/claim-types");
}
