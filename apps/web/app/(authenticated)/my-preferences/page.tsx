import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/lib/routes";

export default function MyPreferencesRedirectPage(): never {
  redirect(APP_ROUTES.me);
}
