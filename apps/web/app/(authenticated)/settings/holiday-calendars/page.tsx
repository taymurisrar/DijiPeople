import { redirect } from "next/navigation";

export default async function HolidayCalendarsPage() {
  redirect("/settings/work-calendars");
}
