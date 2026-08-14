-- Schedule and work-calendar resolution moves off the Work Site and onto the
-- organizational hierarchy.
--
-- WHY. A Work Site is a physical place. One Karachi office holds a Finance team
-- on 09:00-18:00, a Support team on a 24/7 rotation and individual employees on
-- bespoke arrangements, and its employees may follow different regional
-- calendars. Using the site as the schedule authority forced all of them onto
-- one pattern.
--
-- ADDITIVE ONLY. Every column below is nullable with no default, so this
-- migration cannot change how any existing row resolves today. The two Location
-- columns are deliberately left in place: they still hold tenant configuration
-- that a later compatibility review may want to migrate, and dropping them here
-- would destroy it.

-- Employee: the most specific calendar layer. The schedule counterpart
-- (`defaultWorkScheduleId`) already exists.
ALTER TABLE "Employee" ADD COLUMN "holidayCalendarId" TEXT;

-- Department: the schedule counterpart already exists.
ALTER TABLE "Department" ADD COLUMN "holidayCalendarId" TEXT;

-- Team: neither existed. This is the layer the hierarchy was missing.
ALTER TABLE "Team" ADD COLUMN "defaultWorkScheduleId" TEXT;
ALTER TABLE "Team" ADD COLUMN "holidayCalendarId" TEXT;

CREATE INDEX "Employee_tenantId_holidayCalendarId_idx"
  ON "Employee"("tenantId", "holidayCalendarId");
CREATE INDEX "Department_tenantId_holidayCalendarId_idx"
  ON "Department"("tenantId", "holidayCalendarId");
CREATE INDEX "Team_tenantId_defaultWorkScheduleId_idx"
  ON "Team"("tenantId", "defaultWorkScheduleId");
CREATE INDEX "Team_tenantId_holidayCalendarId_idx"
  ON "Team"("tenantId", "holidayCalendarId");

-- SET NULL rather than RESTRICT: deleting a calendar or schedule must not be
-- blocked by a pointer, and an employee who loses their specific assignment
-- correctly falls through to the next layer of the hierarchy.
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_holidayCalendarId_fkey"
  FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_holidayCalendarId_fkey"
  FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_defaultWorkScheduleId_fkey"
  FOREIGN KEY ("defaultWorkScheduleId") REFERENCES "WorkSchedule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_holidayCalendarId_fkey"
  FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
