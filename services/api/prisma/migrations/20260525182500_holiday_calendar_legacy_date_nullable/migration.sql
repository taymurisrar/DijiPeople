-- HolidayCalendar used to represent individual holidays and required "date".
-- It now represents a reusable calendar header; individual dates live in Holiday.
ALTER TABLE "HolidayCalendar"
  ALTER COLUMN "date" DROP NOT NULL;

