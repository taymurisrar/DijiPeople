import { apiRequestJson } from "@/lib/server-api";
import type { FieldMetadata } from "../metadata-runtime.types";
import type { ModuleRuntimeContext } from "../module-runtime.types";

export type AttendanceRuntimeConfiguration = {
  status: "AVAILABLE" | "INVALID" | "ERROR";
  source?: "policy" | "settings" | "catalog-default";
  policy: {
    lateCheckInGraceMinutes: number;
    lateCheckOutGraceMinutes: number;
    requireOfficeLocationForOfficeMode: boolean;
    requireRemoteLocationForRemoteMode: boolean;
    allowRemoteWithoutLocation: boolean;
    allowManualAdjustments: boolean;
    allowedModes: string[];
    standardWorkHoursPerDay: number;
  } | null;
  issues: string[];
};

export async function loadAttendanceRuntimeConfiguration(): Promise<AttendanceRuntimeConfiguration> {
  try {
    return await apiRequestJson<AttendanceRuntimeConfiguration>(
      "/attendance/configuration",
    );
  } catch (error) {
    return {
      status: "ERROR",
      policy: null,
      issues: [
        error instanceof Error
          ? `Attendance Configuration could not be loaded: ${error.message}`
          : "Attendance Configuration could not be loaded.",
      ],
    };
  }
}

export function applyAttendanceConfiguration(
  runtime: ModuleRuntimeContext,
  configuration: AttendanceRuntimeConfiguration,
): ModuleRuntimeContext {
  const allowedModes = configuration.policy?.allowedModes ?? [];

  return {
    ...runtime,
    metadata: {
      ...runtime.metadata,
      entity: {
        ...runtime.metadata.entity,
        fields: runtime.metadata.entity.fields.map((field) =>
          field.logicalName === "attendanceMode"
            ? attendanceModeField(field, allowedModes)
            : field,
        ),
      },
    },
  };
}

function attendanceModeField(
  field: FieldMetadata,
  allowedModes: readonly string[],
): FieldMetadata {
  return {
    ...field,
    options: allowedModes.map((mode) => ({
      value: mode,
      label: attendanceModeLabel(mode),
    })),
  };
}

function attendanceModeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
