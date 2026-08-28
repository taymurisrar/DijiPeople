import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New leads",
};


export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const { partnerId } = await searchParams;
  return (
    <RuntimeRecordRoute
      moduleKey="leads"
      initialValues={{ partnerId: partnerId ?? "", status: "NEW" }}
    />
  );
}
