import type { Metadata } from "next";
import { NumberSequencesManager } from "@/app/_components/settings/number-sequences-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { requireSystemAdminUser } from "@/lib/auth";
import type { NumberSequence } from "@/lib/number-sequence-format";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Numbering",
};

export default async function NumberingSettingsPage() {
  await requireSystemAdminUser("/settings/numbering");

  let sequences: NumberSequence[] | null = null;
  let failure: "denied" | "error" | null = null;
  try {
    sequences = await apiRequestJson<NumberSequence[]>(
      "/super-admin/platform-settings/numbering",
    );
  } catch (error) {
    failure =
      error instanceof ApiRequestError && error.status === 403
        ? "denied"
        : "error";
  }

  return (
    <SettingsShell
      title="Numbering"
      description="Number formats for platform records."
    >
      {failure === "denied" ? (
        <AppNotification tone="warning">
          You do not have access to numbering settings.
        </AppNotification>
      ) : failure === "error" || !sequences ? (
        <AppNotification tone="error">
          Numbering settings could not be loaded. Reload the page to try again.
        </AppNotification>
      ) : (
        <NumberSequencesManager initialSequences={sequences} />
      )}
    </SettingsShell>
  );
}
