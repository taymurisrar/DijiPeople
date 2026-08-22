import { PartnerInquiryReview } from "@/app/_components/partners/partner-inquiry-review";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

type Inquiry = {
  id: string;
  referenceNumber: string;
  status: string;
  type: string;
  companyName?: string | null;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  website?: string | null;
  message?: string | null;
  source?: string | null;
  qualificationNotes?: string | null;
  assignedToUserId?: string | null;
  createdAt: string;
  partner?: { id: string; displayName: string } | null;
};

type Owner = { id: string; fullName: string; email: string; role: string };

export default async function PartnerInquiryDetailPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>;
}) {
  const { inquiryId } = await params;
  const user = await requireSystemAdminUser("/partner-inquiries");
  const [response, owners] = await Promise.all([
    apiRequestJson<{ item: Inquiry }>(
      `/platform-runtime/partner-inquiries/${inquiryId}`,
    ),
    apiRequestJson<Owner[]>("/platform-users/owner-candidates"),
  ]);
  return (
    <PartnerInquiryReview
      initialItem={response.item}
      owners={owners}
      roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      permissionKeys={user.permissionKeys}
    />
  );
}
