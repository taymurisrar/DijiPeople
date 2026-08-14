import { getSettingsAdapter } from "./settings-adapter-registry";
import {
  WORK_SITE_SECTION_IDS,
  WORK_SITE_TAB_KEYS,
} from "./work-site-form-sections";

/**
 * The Work Site page shape.
 *
 * These assertions exist because the layout regressed twice in ways a typecheck
 * cannot see: the operational summary was pinned above the tab strip AND
 * repeated inside the Summary tab, and a Work Planning tab asked administrators
 * to set a schedule on a physical place that holds several teams working
 * different hours.
 */

function workSiteSpec() {
  const adapter = getSettingsAdapter("locations");
  if (!adapter) throw new Error("The Work Site settings adapter is missing.");
  return adapter.spec;
}

function sections() {
  return workSiteSpec().formSections ?? [];
}

describe("work site form layout", () => {
  it("has exactly the five intended tabs, in order", () => {
    const tabKeys: string[] = [];
    for (const section of sections()) {
      const tabKey = section.tabKey ?? "general";
      if (!tabKeys.includes(tabKey)) tabKeys.push(tabKey);
    }

    expect(tabKeys).toEqual([
      WORK_SITE_TAB_KEYS.general,
      WORK_SITE_TAB_KEYS.location,
      WORK_SITE_TAB_KEYS.attendance,
      WORK_SITE_TAB_KEYS.related,
      WORK_SITE_TAB_KEYS.more,
    ]);
  });

  it("has no Work Planning tab", () => {
    const tabKeys = sections().map((section) => section.tabKey);
    expect(tabKeys).not.toContain("work-planning");
    expect(tabKeys).not.toContain("planning");
  });

  it("leaves no tab without a section", () => {
    for (const tabKey of Object.values(WORK_SITE_TAB_KEYS)) {
      const onTab = sections().filter(
        (section) => (section.tabKey ?? "general") === tabKey,
      );
      expect(onTab.length).toBeGreaterThan(0);
    }
  });

  it("renders the operational summary once, inside the Summary tab", () => {
    const overview = sections().filter(
      (section) => section.id === WORK_SITE_SECTION_IDS.overview,
    );
    expect(overview).toHaveLength(1);
    expect(overview[0]?.tabKey).toBe(WORK_SITE_TAB_KEYS.general);
  });

  it("keeps Location & Geofence, Attendance Policy and Related", () => {
    const ids = sections().map((section) => section.id);
    expect(ids).toContain(WORK_SITE_SECTION_IDS.address);
    expect(ids).toContain(WORK_SITE_SECTION_IDS.geofence);
    expect(ids).toContain(WORK_SITE_SECTION_IDS.attendancePolicy);
    expect(ids).toContain(WORK_SITE_SECTION_IDS.related);
  });

  it("groups Effective Period and Advanced under More", () => {
    const more = sections().filter(
      (section) => section.tabKey === WORK_SITE_TAB_KEYS.more,
    );
    expect(more.map((section) => section.id)).toEqual([
      WORK_SITE_SECTION_IDS.effectivePeriod,
      WORK_SITE_SECTION_IDS.advanced,
    ]);
    // The tab is named by `tabLabel` so the first section keeps its own heading.
    expect(more[0]?.tabLabel).toBe("More");
    expect(more[0]?.label).toBe("Configuration Effective Period");
  });
});

describe("work site fields", () => {
  it("exposes no work schedule or work calendar field", () => {
    const fieldNames = workSiteSpec().fields.map((field) => field.logicalName);
    expect(fieldNames).not.toContain("defaultWorkScheduleId");
    expect(fieldNames).not.toContain("holidayCalendarId");
  });

  it("places no schedule or calendar field on any form section", () => {
    const placed = sections().flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    );
    expect(placed).not.toContain("defaultWorkScheduleId");
    expect(placed).not.toContain("holidayCalendarId");
  });

  it("no longer loads schedule or calendar lookups", () => {
    const adapter = getSettingsAdapter("locations");
    expect(adapter?.lookupSources.defaultWorkScheduleId).toBeUndefined();
    expect(adapter?.lookupSources.holidayCalendarId).toBeUndefined();
  });

  it("keeps the attendance capture columns it does own", () => {
    const fieldNames = workSiteSpec().fields.map((field) => field.logicalName);
    expect(fieldNames).toContain("allowedAttendanceMethods");
    expect(fieldNames).toContain("devicePolicy");
    expect(fieldNames).toContain("webAttendancePolicy");
    expect(fieldNames).toContain("webFallbackEnabled");
    expect(fieldNames).toContain("allowedRadiusMeters");
  });
});
