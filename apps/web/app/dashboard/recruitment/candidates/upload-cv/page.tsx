import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SharedLookupOption } from "@/app/dashboard/_components/documents/types";
import { LookupOption } from "@/app/dashboard/employees/types";
import { CvUploadParseFlow } from "../../_components/cv-upload-parse-flow";

export default async function UploadCvPage() {
  const [countries, documentTypes] = await Promise.all([
    apiRequestJson<LookupOption[]>("/lookups/countries"),
    apiRequestJson<SharedLookupOption[]>("/lookups/document-types"),
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Recruitment</p>
          <h3 className="font-serif text-4xl text-foreground">CV Upload & Parse</h3>
          <p className="max-w-3xl text-muted">
            Intake resumes from any source, review parsed details, and save a clean candidate profile.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/candidates"
          >
            Back to Candidates
          </Link>
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment"
          >
            Recruitment Home
          </Link>
        </div>
      </section>

      <CvUploadParseFlow countries={countries} documentTypes={documentTypes} />
    </main>
  );
}
