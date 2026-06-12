export type CommandPayloadField = {
  readonly key: string;
  readonly label: string;
  readonly type: "select" | "lookup" | "multiline";
  readonly required?: boolean;
  readonly optionsSource?: string;
  readonly visibleWhen?: {
    readonly field: string;
    readonly equals: string;
  };
};

export type CommandPayloadSchema = {
  readonly key: string;
  readonly title: string;
  readonly submitLabel: string;
  readonly contextPath?: string;
  readonly fields: readonly CommandPayloadField[];
  readonly geolocation?: {
    readonly requiredWhen: {
      readonly field: string;
      readonly values: readonly string[];
    };
  };
};

const schemas: Readonly<Record<string, CommandPayloadSchema>> = {
  "attendance.checkIn": {
    key: "attendance.checkIn",
    title: "Check In",
    submitLabel: "Check In",
    contextPath: "/api/attendance/runtime-context",
    fields: [
      {
        key: "attendanceMode",
        label: "Work Mode",
        type: "select",
        required: true,
        optionsSource: "allowedModes",
      },
      {
        key: "officeLocationId",
        label: "Work Site",
        type: "lookup",
        required: true,
        optionsSource: "workSites",
        visibleWhen: { field: "attendanceMode", equals: "OFFICE" },
      },
      {
        key: "note",
        label: "Check In Notes",
        type: "multiline",
      },
    ],
    geolocation: {
      requiredWhen: {
        field: "attendanceMode",
        values: ["REMOTE", "HYBRID"],
      },
    },
  },
  "attendance.checkOut": {
    key: "attendance.checkOut",
    title: "Check Out",
    submitLabel: "Check Out",
    contextPath: "/api/attendance/runtime-context",
    fields: [
      {
        key: "note",
        label: "Check Out Notes",
        type: "multiline",
      },
    ],
    geolocation: {
      requiredWhen: {
        field: "todayAttendance.attendanceMode",
        values: ["REMOTE", "HYBRID"],
      },
    },
  },
};

export function getCommandPayloadSchema(key?: string) {
  return key ? (schemas[key] ?? null) : null;
}
