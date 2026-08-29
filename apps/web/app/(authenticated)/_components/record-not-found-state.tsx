"use client";

/*
 * BUG-2014 — a record that does not exist used to be reported with
 * `AccessDeniedState`, so an administrator who typed `/users/new` was told
 * "ACCESS DENIED — You cannot view this user record" for a permission they
 * hold and a record that never existed. A 404 and a 403 are different answers
 * and the product has to be able to say both.
 *
 * Built on the shared `EmptyState` rather than a hand-rolled panel, so it
 * follows the same empty-surface conventions as every other list and record
 * screen.
 */

import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";

export function RecordNotFoundState({
  title = "This record could not be found.",
  description = "It may have been deleted or moved, or the address may be wrong. Check the link and try again.",
  actionHref = "/",
  actionLabel = "Back to dashboard",
}: {
  readonly title?: string;
  readonly description?: string;
  readonly actionHref?: string;
  readonly actionLabel?: string;
}) {
  return (
    <EmptyState
      action={
        <Button href={actionHref} variant="secondary">
          {actionLabel}
        </Button>
      }
      description={description}
      title={title}
    />
  );
}
