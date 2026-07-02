import { redirect } from "next/navigation";

export default function LegacyAccessSettingsIndexPage() {
  redirect("/settings/security-access");
}
