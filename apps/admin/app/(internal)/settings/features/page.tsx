import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";

const features = [
  "Employees",
  "Organization",
  "Leave",
  "Attendance",
  "Timesheets",
  "Projects",
  "Recruitment",
  "Onboarding",
  "Documents",
  "Notifications",
  "Branding",
  "Payroll",
];

export default async function FeatureCatalogSettingsPage() {
  return (
    <SettingsShell
      title="Feature catalog"
      description="Control which modules and capabilities are available for commercial plans and tenant-level activation."
    >
      <SettingsFormCard
        title="Available platform features"
        description="Features enabled here can be assigned to plans and later activated inside tenant workspaces."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {features.map((feature) => (
            <label
              key={feature}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  {feature}
                </span>
                <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-slate-500">
                  {feature.toLowerCase().replaceAll(" ", "-")}
                </span>
              </span>

              <input type="checkbox" defaultChecked className="h-4 w-4" />
            </label>
          ))}
        </div>
      </SettingsFormCard>
    </SettingsShell>
  );
}