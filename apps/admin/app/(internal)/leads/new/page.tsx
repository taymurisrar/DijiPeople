import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

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
