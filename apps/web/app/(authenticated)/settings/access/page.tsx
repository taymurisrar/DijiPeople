import { redirect } from "next/navigation";

export default function AccessSettingsIndexPage() {
  redirect("/settings/access/roles");
}
