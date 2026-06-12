"use client";

import { useRouter } from "next/navigation";
import { AttendanceRecordDetailDialog } from "./attendance-record-detail-dialog";

type AttendanceRecordEditClientProps = {
  canOverride: boolean;
  formatting: {
    dateFormat: string;
    locale: string;
    timezone: string;
  };
  recordId: string;
};

export function AttendanceRecordEditClient({
  canOverride,
  formatting,
  recordId,
}: AttendanceRecordEditClientProps) {
  const router = useRouter();

  return (
    <AttendanceRecordDetailDialog
      canOverride={canOverride}
      formatting={formatting}
      onClose={() => router.push("/attendance")}
      open
      recordId={recordId}
    />
  );
}
