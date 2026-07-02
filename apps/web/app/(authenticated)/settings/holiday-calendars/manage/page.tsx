import { SettingsShell } from "../../_components/settings-shell";
import { HolidayCalendarManager } from "./holiday-calendar-manager";

export default function HolidayCalendarManagePage() {
  return (
    <SettingsShell
      title="Holiday Calendars"
      description="Create regional holiday calendars and maintain the holidays used by work calendars and work schedules."
    >
      <HolidayCalendarManager />
    </SettingsShell>
  );
}
