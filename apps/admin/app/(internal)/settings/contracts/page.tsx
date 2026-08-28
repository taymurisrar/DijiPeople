import type { Metadata } from "next";
import { PageHeader } from "@/app/_components/ui/page-header";
import { OperationalSettingsForm } from "@/app/_components/settings/operational-settings-form";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Contracts",
};


export default async function Page() {
  const data = await apiRequestJson<{ contractSettings: Record<string, unknown> }>(
    "/super-admin/platform-settings",
  );
  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Settings / Agreements"
        title="Contracts and agreements"
        description="Control approval, signature, consent, expiry, and renewal behavior, and the standing terms resolved into agreement placeholders."
      />
      <OperationalSettingsForm
        title="Contract policy"
        description="These rules apply to the normalized contract and e-signature workflows, and resolve the platform, legal, service-level, and hosting placeholders used by agreement templates."
        settingKey="contractSettings"
        initialValues={data.contractSettings}
        fields={[
          { key: "signatureExpiryDays", label: "Signature expiry (days)", description: "Default lifetime of secure signing links.", type: "number", min: 1, max: 90 },
          { key: "allowedSignatureMethods", label: "Allowed signature methods", description: "Methods recipients may use to sign.", type: "multi", options: ["TYPED", "DRAWN", "UPLOADED"] },
          { key: "requireCommercialApproval", label: "Require commercial approval", description: "Commercial review must complete before signing.", type: "boolean" },
          { key: "requireLegalApproval", label: "Require legal approval", description: "Legal review must complete before signing.", type: "boolean" },
          { key: "renewalReminderDays", label: "Renewal reminder (days)", description: "Lead time for expiring agreement alerts.", type: "number", min: 1, max: 365 },
          { key: "consentText", label: "Electronic signature consent", description: "Legally meaningful consent shown to every signer.", type: "textarea" },
          { key: "authorizedSignerName", label: "Authorized signer", description: "Resolves {{platform.authorizedSigner.name}}.", type: "text" },
          { key: "authorizedSignerTitle", label: "Authorized signer title", description: "Resolves {{platform.authorizedSigner.title}}.", type: "text" },
          { key: "defaultInitialTerm", label: "Initial term", description: "Resolves {{contract.initialTerm}}.", type: "text" },
          { key: "defaultRenewalTerm", label: "Renewal term", description: "Resolves {{contract.renewalTerm}}.", type: "text" },
          { key: "defaultLiabilityCap", label: "Limitation of liability", description: "Resolves {{contract.liabilityCap}}.", type: "textarea" },
          { key: "defaultCurePeriodDays", label: "Cure period (days)", description: "Resolves {{contract.curePeriodDays}}.", type: "number", min: 0, max: 365 },
          { key: "defaultDataRetentionDays", label: "Data retention (days)", description: "Resolves {{contract.dataRetentionDays}}.", type: "number", min: 0, max: 3650 },
          { key: "defaultDataExportPeriodDays", label: "Data export window (days)", description: "Resolves {{contract.dataExportPeriodDays}}.", type: "number", min: 0, max: 365 },
          { key: "defaultSupportTier", label: "Support tier", description: "Resolves {{sla.supportTier}}.", type: "text" },
          { key: "defaultSupportHours", label: "Support hours", description: "Resolves {{sla.supportHours}}.", type: "text" },
          { key: "defaultSupportChannels", label: "Support channels", description: "Resolves {{sla.supportChannels}}.", type: "text" },
          { key: "defaultUptimeTarget", label: "Uptime target (%)", description: "Resolves {{sla.uptimeTarget}}.", type: "number", min: 0, max: 100 },
          { key: "defaultBackupFrequency", label: "Backup frequency", description: "Resolves {{sla.backupFrequency}}.", type: "text" },
          { key: "defaultBackupRetention", label: "Backup retention", description: "Resolves {{sla.backupRetention}}.", type: "text" },
          { key: "defaultRecoveryPointObjective", label: "Recovery point objective", description: "Resolves {{sla.rpo}}.", type: "text" },
          { key: "defaultRecoveryTimeObjective", label: "Recovery time objective", description: "Resolves {{sla.rto}}.", type: "text" },
          { key: "hostingApplicationProvider", label: "Application hosting provider", description: "Resolves {{hosting.applicationProvider}}.", type: "text" },
          { key: "hostingDatabaseProvider", label: "Database hosting provider", description: "Resolves {{hosting.databaseProvider}}.", type: "text" },
          { key: "hostingEmailProvider", label: "Email provider", description: "Resolves {{hosting.emailProvider}}.", type: "text" },
          { key: "hostingApplicationRegion", label: "Application region", description: "Resolves {{hosting.applicationRegion}}.", type: "text" },
          { key: "hostingDatabaseRegion", label: "Database region", description: "Resolves {{hosting.databaseRegion}}.", type: "text" },
        ]}
      />
    </main>
  );
}
