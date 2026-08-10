import { PlatformEmailSettingsWorkspace } from "@/app/_components/settings/platform-email-settings-workspace";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";

export default async function EmailProviderSettingsPage() {
  const [settings, templates, deliveries] = await Promise.all([
    apiRequestJson<PlatformEmailSettings>("/super-admin/platform-email"),
    apiRequestJson<{ items: PlatformEmailTemplate[] }>(
      "/super-admin/platform-email/templates",
    ),
    apiRequestJson<{ items: PlatformEmailDelivery[] }>(
      "/super-admin/platform-email/deliveries?limit=25",
    ),
  ]);

  return (
    <SettingsShell
      title="Platform email"
      description="Configure secure outbound delivery for DijiPeople platform messages, maintain system templates, and review recent sends."
    >
      <PlatformEmailSettingsWorkspace
        initialSettings={settings}
        initialTemplates={templates.items}
        initialDeliveries={deliveries.items}
      />
    </SettingsShell>
  );
}

export type PlatformEmailSettings = {
  enabled: boolean;
  providerType: "CONSOLE" | "SMTP";
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpAuthEnabled: boolean;
  smtpUsername: string;
  smtpSecurity: "NONE" | "STARTTLS" | "TLS";
  connectionTimeoutMs: number;
  passwordConfigured: boolean;
  source: "stored" | "default";
  capabilities: {
    canManage: boolean;
    canManageCredentials: boolean;
    canTest: boolean;
  };
};

export type PlatformEmailTemplate = {
  id: string;
  eventCode: string;
  templateKey: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  availableVariables: unknown;
  status: string;
  version: number;
  updatedAt: string;
};

export type PlatformEmailDelivery = {
  id: string;
  eventCode: string;
  recipient: string;
  subject: string;
  status: string;
  providerType: string | null;
  providerMessageId: string | null;
  entityType: string | null;
  entityId: string | null;
  attemptCount: number;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
};
