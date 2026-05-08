import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { ClaimTypeRecord } from "../../claims/claim-types";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";

export default async function ClaimTypesSettingsPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.CLAIM_TYPES_READ]);

  const types = await apiRequestJson<ClaimTypeRecord[]>("/claims/types");
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Settings
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">
          Claim Types
        </h2>
        <p className="mt-3 max-w-3xl text-muted">
          Configure claim type and subtype catalog entries used by reimbursement
          requests.
        </p>
      </section>
      <section className="grid gap-3">
        {types.map((type) => (
          <article
            className="rounded-2xl border border-border bg-white p-4"
            key={type.id}
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">
                  {type.code} / {type.name}
                </p>
                <p className="text-sm text-muted">
                  {type.description ?? "No description"}
                </p>
              </div>
              <p className="text-sm text-muted">
                {type.isActive ? "Active" : "Inactive"}
              </p>
            </div>
            {type.subTypes?.length ? (
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
                {type.subTypes.map((subType) => (
                  <span
                    className="rounded-xl border border-border px-3 py-1"
                    key={subType.id}
                  >
                    {subType.code}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
