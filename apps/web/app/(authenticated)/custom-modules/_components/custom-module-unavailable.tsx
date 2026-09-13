import { AccessDeniedState } from "../../_components/access-denied-state";
import { RecordNotFoundState } from "../../_components/record-not-found-state";

/*
 * What a custom-module route renders when the API refuses it (BUG-3494): a
 * module that is unpublished, deactivated or unknown is not-found; a user
 * without custom-record access is access-denied. Both are the shared states
 * with their existing wording, never the error boundary.
 */
export function CustomModuleUnavailable({
  status,
}: {
  readonly status: "forbidden" | "not-found";
}) {
  return (
    <div className="dp-theme-scope grid gap-6">
      {status === "forbidden" ? <AccessDeniedState /> : <RecordNotFoundState />}
    </div>
  );
}
