import type { ReactNode } from "react";
import { EmptyState } from "../ui/empty-state";

export function ModuleEmptyState({
  action,
  description = "There are no records to show for the selected view.",
  title = "No records found",
}: {
  readonly action?: ReactNode;
  readonly description?: string;
  readonly title?: string;
}) {
  return <EmptyState action={action} description={description} title={title} />;
}
