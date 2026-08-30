"use client";

import { PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AttendanceCorrectionForm } from "./attendance-correction-form";
import type { AttendanceEntrySeed } from "./correction-form-fields";

/**
 * Raising a correction against the record the employee is already reading.
 *
 * WHY THIS IS NOT AN EDIT OF THE RECORD. The button says the record becomes
 * editable and the panel is built to feel that way — the fields open holding
 * what the record says, and the submit control sits at the top. What it writes
 * is an `AttendanceCorrectionRequest`, never the attendance row.
 *
 * That distinction is the whole design. The request stores the original and the
 * requested value side by side, which is what lets the manager see the delta and
 * what leaves the record untouched on rejection. Editing the row directly would
 * need a shadow copy of the original to preserve the same diff — the schema
 * rebuilt, badly — and would put an unapproved time into a row payroll reads.
 *
 * It also is not a runtime `detail-command-bar` command. Those resolve through
 * `command-runtime.resolver`, which hands the handler a record id and no record;
 * this panel seeds from the fetched entry, so it is mounted beside
 * `StandardModuleRecordPage` the same way `AttendanceDayPanel` already is.
 */
export function AttendanceCorrectionPanel({
  entry,
  canRequest,
}: {
  entry: AttendanceEntrySeed;
  /**
   * Whether this viewer may raise a correction for this record.
   *
   * Cosmetic, like every permission decision in this app. `POST
   * /attendance/correction-requests` re-decides it, and is the only answer that
   * counts.
   */
  canRequest: boolean;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  if (!canRequest) return null;

  if (!isOpen) {
    return (
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Something wrong with this record?
            </h3>
            <p className="mt-1 text-sm text-muted">
              Ask your line manager to correct it. The record stays as it is
              until they approve.
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            <PencilLine className="h-4 w-4" />
            Correction request
          </button>
        </div>
      </section>
    );
  }

  return (
    <AttendanceCorrectionForm
      entry={entry}
      onCancel={() => setIsOpen(false)}
      onSubmitted={(requestId) => {
        // Straight to the request, so the employee can see it exists and where
        // it sits. `refresh` first because the record page behind it now has a
        // pending correction against it.
        router.refresh();
        router.push(
          requestId
            ? `/attendance/corrections/${requestId}`
            : "/attendance/corrections",
        );
      }}
    />
  );
}
