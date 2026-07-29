import { notFound } from "next/navigation";
import { SettingsShell } from "../../../_components/settings-shell";
import { SettingsRuntimeList } from "../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../_lib/settings-runtime";
import { HolidayCalendarManager } from "../../../holiday-calendars/manage/holiday-calendar-manager";

export default async function SettingsItemListPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; settingGroup: string; item: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, settingGroup, item: itemKey } = await params;
  const item = getSettingsRuntimeItem(category, itemKey);
  if (!item || item.group !== settingGroup) notFound();
  if (item.key === "holiday-calendars") {
    return (
      <SettingsShell
        title="Holiday Calendars"
        description="Create scoped holiday calendars and maintain the holidays used by work calendars and work schedules."
      >
        <HolidayCalendarManager />
      </SettingsShell>
    );
  }
  return <SettingsRuntimeList item={item} searchParams={searchParams} />;
}
