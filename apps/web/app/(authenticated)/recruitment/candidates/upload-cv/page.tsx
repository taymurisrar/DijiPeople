import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SharedLookupOption } from "@/app/(authenticated)/_components/documents/types";
import { LookupOption } from "@/app/(authenticated)/employees/types";
import { CvUploadParseFlow } from "../../_components/cv-upload-parse-flow";

export default async function UploadCvPage() {
  const [countries, documentTypes, documentCategories] = await Promise.all([
    apiRequestJson<LookupOption[]>("/lookups/countries"),
    apiRequestJson<SharedLookupOption[]>("/lookups/document-types"),
    apiRequestJson<SharedLookupOption[]>("/lookups/document-categories"),
  ]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Recruitment
          </p>
          <h3 className="font-serif text-3xl text-foreground">Upload CV</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Parse a resume into a candidate draft.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
          <Link
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/recruitment/candidates"
          >
            Back to Candidates
          </Link>
          <Link
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/recruitment"
          >
            Recruitment Home
          </Link>
        </div>
      </section>

      <CvUploadParseFlow
        countries={countries}
        documentTypes={documentTypes}
        documentCategories={documentCategories}
      />
    </div>
  );
}
