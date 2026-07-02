import { notFound, redirect } from "next/navigation";
import { SettingsShell } from "../../../../_components/settings-shell";
import { getSettingsAdapter } from "../../../../_lib/settings-adapter-registry";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";
import { HolidayCalendarManager } from "../../../../holiday-calendars/manage/holiday-calendar-manager";

export default async function SettingsSpecializedManagePage({
  params,
}: {
  params: Promise<{ category: string; settingGroup: string; item: string }>;
}) {
  const { category, settingGroup, item: itemKey } = await params;
  const resolvedItemKey = itemKey === "holidays" ? "holiday-calendars" : itemKey;
  const item = getSettingsRuntimeItem(category, resolvedItemKey);
  if (!item || item.group !== settingGroup) notFound();

  if (resolvedItemKey === "holiday-calendars") {
    return (
      <SettingsShell
        title="Holiday Calendars"
        description="Create regional holiday calendars and maintain the holidays used by work calendars and work schedules."
      >
        <HolidayCalendarManager />
      </SettingsShell>
    );
  }

  const adapter = getSettingsAdapter(item.key);
  if (!adapter?.specializedHref) notFound();

  redirect(adapter.specializedHref);
}
