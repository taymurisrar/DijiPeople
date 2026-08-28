import type { Metadata } from "next";
import { PageHeader } from "@/app/_components/ui/page-header";
import { OperationalSettingsForm } from "@/app/_components/settings/operational-settings-form";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Company Profile",
};


export default async function CompanyProfileSettingsPage() {
  const data = await apiRequestJson<{ companyProfile: Record<string, unknown> }>(
    "/super-admin/platform-settings",
  );
  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Settings / General"
        title="Company profile"
        description="Maintain the authoritative platform identity used by public pages, communications, contracts, and document placeholders."
      />
      <OperationalSettingsForm
        title="Company identity"
        description="These persisted values resolve platform contract tags and customer-facing identity."
        settingKey="companyProfile"
        initialValues={data.companyProfile}
        fields={[
          { key: "companyName", label: "Company name", description: "Public platform name.", type: "text" },
          { key: "legalName", label: "Legal name", description: "Legal contracting entity.", type: "text" },
          { key: "registrationNumber", label: "Registration number", description: "Business registration identifier.", type: "text" },
          { key: "taxNumber", label: "Tax number", description: "Tax registration identifier.", type: "text" },
          { key: "supportEmail", label: "Support email", description: "Customer-facing support mailbox.", type: "text" },
          { key: "website", label: "Website", description: "Public company website.", type: "text" },
          { key: "country", label: "Country", description: "Registered country.", type: "text" },
          { key: "city", label: "City", description: "Registered city.", type: "text" },
          { key: "streetAddress", label: "Street address", description: "Registered street address.", type: "text" },
          { key: "postalCode", label: "Postal code", description: "Registered postal code.", type: "text" },
        ]}
      />
    </main>
  );
}
