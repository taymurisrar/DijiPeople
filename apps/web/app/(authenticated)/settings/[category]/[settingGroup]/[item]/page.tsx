import { notFound, redirect } from "next/navigation";
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
  /*
   * Items served by a purpose-built page live at their own URL. Reaching this
   * generic path for one of them — an old bookmark, a stale link — would render
   * an empty runtime list, so send the reader to the page that actually answers.
   */
  if (item.route !== `/settings/${category}/${settingGroup}/${itemKey}`) {
    redirect(item.route);
  }
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
