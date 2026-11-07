import { redirect } from "next/navigation";

/**
 * Bulk import lives in Settings > Data Management.
 *
 * Without this file the dynamic `[employeeId]` segment captured "import" and
 * the API answered "uuid is expected", so a bookmarked or typed
 * `/employees/import` rendered a crash (DP-QA-004). The Import command now goes
 * straight to the importer; this keeps old links working.
 */
export default function EmployeesImportRedirect() {
  redirect("/settings/data-management");
}
