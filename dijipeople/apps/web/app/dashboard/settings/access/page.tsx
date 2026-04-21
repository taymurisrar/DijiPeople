import { redirect } from "next/navigation";

export default function AccessSettingsIndexPage() {
  redirect("/dashboard/settings/access/roles");
}
