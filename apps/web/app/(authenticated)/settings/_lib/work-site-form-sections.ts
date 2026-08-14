/**
 * The Work Site form layout.
 *
 * Kept beside the adapter rather than inside it because two places need these
 * ids: the metadata that lays the form out, and the client component that
 * substitutes purpose-built bodies for the sections a field grid cannot express.
 * A string mismatch between the two would silently render an empty section, so
 * they share one constant.
 *
 * WHAT A WORK SITE OWNS. A physical place: address, timezone, coordinates,
 * geofence, attendance capture policy, its devices and gateway, who is
 * authorized there, and the period the configuration applies. It does NOT own
 * the work schedule or the work calendar — one office holds a Finance team on
 * 09:00-18:00 and a Support team on a 24/7 rotation, and its employees may
 * follow different regional calendars. Those resolve down the organizational
 * hierarchy instead (see `work-configuration-hierarchy.ts` on the API side), so
 * there is deliberately no Work Planning tab here.
 *
 * Tab order follows section order; tab labels come from the first section on
 * each tab, or its `tabLabel` where the tab groups unrelated sections.
 */

export const WORK_SITE_SECTION_IDS = {
  overview: "work-site-overview",
  general: "work-site-general",
  address: "work-site-address",
  geofence: "work-site-geofence",
  accuracy: "work-site-accuracy",
  testLocation: "work-site-test-location",
  attendancePolicy: "work-site-attendance-policy",
  related: "work-site-related",
  effectivePeriod: "work-site-effective-period",
  advanced: "work-site-advanced",
} as const;

export const WORK_SITE_TAB_KEYS = {
  general: "general",
  location: "location",
  attendance: "attendance-policy",
  related: "related",
  more: "more",
} as const;
