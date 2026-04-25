import type { SettingsCardProps } from "./settings-card";
import { SettingsCard } from "./settings-card";

type SettingsSectionProps = {
  title: string;
  description: string;
  items: SettingsCardProps[];
};

export function SettingsSection({
  title,
  description,
  items,
}: SettingsSectionProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        <span className="text-sm font-medium text-slate-500">
          {items.length} setting{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <SettingsCard key={item.href} {...item} />
        ))}
      </div>
    </section>
  );
}