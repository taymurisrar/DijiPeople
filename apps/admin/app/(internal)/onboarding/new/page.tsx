import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New onboarding",
};


export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;
  return (
    <RuntimeRecordRoute
      moduleKey="customer-onboarding"
      initialValues={{
        customerId: customerId ?? "",
        status: "NOT_STARTED",
        discountType: "NONE",
        discountValue: 0,
        createServiceAccount: false,
        serviceAccountAssignSystemAdmin: true,
        contractSigned: false,
        paymentConfirmed: false,
        implementationKickoffDone: false,
        dataReceived: false,
        configurationReady: false,
        trainingPlanned: false,
        tenantCreated: false,
      }}
    />
  );
}
