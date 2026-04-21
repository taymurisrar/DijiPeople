import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { DesignationRecord } from "../types";

export default async function DesignationsPage() {
  const designations = await apiRequestJson<DesignationRecord[]>("/designations");

  return (
    <SettingsShell
      description="Designations give employee records consistent titles and leave room for future level-based policy and compensation rules."
      eyebrow="Organization Settings"
      title="Designations"
    >
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Designation Catalog
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Reusable titles and levels
            </h3>
          </div>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/designations/new"
          >
            Add designation
          </Link>
        </div>

        {designations.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              No designations yet
            </p>
            <p className="mt-3 text-muted">
              Create the titles your tenant will assign across employees and
              future org workflows.
            </p>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-4">Name</th>
                <th className="px-4">Level</th>
                <th className="px-4">Status</th>
                <th className="px-4">Updated</th>
                <th className="px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {designations.map((designation) => (
                <tr
                  key={designation.id}
                  className="rounded-2xl border border-border bg-white shadow-sm"
                >
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-medium text-foreground">
                      {designation.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {designation.description || "No description"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {designation.level || "Not set"}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {designation.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {new Date(designation.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <Link
                      className="text-sm font-medium text-accent transition hover:text-accent-strong"
                      href={`/dashboard/settings/designations/${designation.id}/edit`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </SettingsShell>
  );
}
