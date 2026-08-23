import {
  LegalDocumentEditor,
  type LegalDocumentSummary,
} from "@/app/_components/settings/legal-document-editor";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";

/**
 * Legal documents — authored here rather than in a seed file.
 *
 * Before this page, the only way to change the Terms of Service was to edit
 * `services/api/prisma/seed-legal.ts` and ship a deploy. That put the copy in
 * the hands of whoever could deploy rather than whoever had it approved, which
 * is why all ten documents sat unpublished as engineering-written drafts and
 * every purchase recorded no consent.
 */
export default async function LegalSettingsPage() {
  const documents =
    await apiRequestJson<LegalDocumentSummary[]>("/super-admin/legal/documents");

  return (
    <SettingsShell
      title="Legal documents"
      description="Draft, review and publish the terms this platform sells under. A published version is immutable — it is the evidence behind every acceptance that names it, so a correction is published as a new version."
    >
      <SettingsFormCard
        title="Documents"
        description="Paste approved copy into a draft and publish it. Publication refuses text that still carries a placeholder or describes itself as an unreviewed draft; the reason is shown before you click."
      >
        <LegalDocumentEditor documents={documents} />
      </SettingsFormCard>
    </SettingsShell>
  );
}
