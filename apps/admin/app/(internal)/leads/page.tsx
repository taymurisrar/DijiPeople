import type { Metadata } from "next";
import { RuntimeModulePage } from "@/app/_components/runtime/runtime-module-page";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Leads",
};


export default function Page() {
  return <RuntimeModulePage moduleKey="leads" />;
}
