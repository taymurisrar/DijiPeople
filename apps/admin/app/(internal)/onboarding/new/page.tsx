import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

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
