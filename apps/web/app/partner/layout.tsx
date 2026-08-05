import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PartnerShell } from "./partner-shell";
import {
  PARTNER_ACCESS_COOKIE,
  PARTNER_REFRESH_COOKIE,
} from "@/lib/partner-auth";

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.get(PARTNER_ACCESS_COOKIE) && !jar.get(PARTNER_REFRESH_COOKIE))
    redirect("/partner-login");
  return <PartnerShell>{children}</PartnerShell>;
}
