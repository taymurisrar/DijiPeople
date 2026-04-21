import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { LocationRecord } from "../types";

export default async function LocationsPage() {
  const locations = await apiRequestJson<LocationRecord[]>("/locations");

  return (
    <SettingsShell
      description="Locations give employees a reusable work site reference and prepare the platform for timezone-aware attendance and policy features."
      eyebrow="Organization Settings"
      title="Locations"
    >
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Location Catalog
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Offices, clinics, and work sites
            </h3>
          </div>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/locations/new"
          >
            Add location
          </Link>
        </div>

        {locations.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              No locations yet
            </p>
            <p className="mt-3 text-muted">
              Add work locations now so employee profiles and later attendance
              features can stay tied to the right site and timezone.
            </p>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-4">Name</th>
                <th className="px-4">City</th>
                <th className="px-4">Timezone</th>
                <th className="px-4">Status</th>
                <th className="px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr
                  key={location.id}
                  className="rounded-2xl border border-border bg-white shadow-sm"
                >
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-medium text-foreground">
                      {location.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {[location.state, location.country].filter(Boolean).join(", ")}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {location.city}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {location.timezone || "Not set"}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {location.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <Link
                      className="text-sm font-medium text-accent transition hover:text-accent-strong"
                      href={`/dashboard/settings/locations/${location.id}/edit`}
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
