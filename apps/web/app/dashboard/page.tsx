import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/lib/routes";

export default function LegacyDashboardPage(): never {
  redirect(APP_ROUTES.home);
}
