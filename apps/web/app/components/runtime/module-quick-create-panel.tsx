"use client";

import { useState } from "react";
import { Dialog } from "@/app/components/ui/dialog";
import { RuntimeMetadataFormRenderer } from "@/app/components/metadata/runtime-metadata-form-renderer";
import type { LookupOption } from "@/app/components/ui/form-control";
import type {
  EntityMetadata,
  FormMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import {
  resolveQuickCreateSubmission,
  type QuickCreateSubmission,
} from "@/lib/runtime/quick-create-metadata";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export function ModuleQuickCreatePanel({
  contextValues = {},
  dataAdapter,
  form,
  lookupOptions = {},
  onClose,
  onSave,
  open,
  parentBinding,
  record,
  runtime,
  entity,
  title,
  error,
}: {
  readonly contextValues?: RuntimeRecordData;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly form: FormMetadata | null;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly onClose: () => void;
  readonly onSave?: (
    values: RuntimeRecordData,
    closeAfterSave: boolean,
  ) => void | Promise<void>;
  readonly open: boolean;
  readonly parentBinding?: {
    readonly fieldLogicalName: string;
    readonly recordId: string;
  };
  readonly record: RuntimeRecordData;
  readonly runtime: ModuleRuntimeContext;
  readonly entity?: EntityMetadata;
  readonly title?: string;
  readonly error?: string | null;
}) {
  const [draftValues, setDraftValues] = useState<RuntimeRecordData>({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, readonly string[]>
  >({});
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [validationSummary, setValidationSummary] = useState<string | null>(
    null,
  );

  const values = parentBinding
    ? {
        ...contextValues,
        ...record,
        ...draftValues,
        [parentBinding.fieldLogicalName]: parentBinding.recordId,
      }
    : { ...contextValues, ...record, ...draftValues };

  /*
   * BUG-1962 — the dialog gates its own save.
   *
   * Its buttons are `type="button"` click handlers, so there is no form submit
   * for the browser's native `required` to gate: a field could carry its
   * required marker and still reach the API empty, which came back as the DTO
   * property name — `effectiveFrom must be a valid ISO 8601 date string` — for a
   * control labelled "Assigned On". `validateRuntimeForm` already produced the
   * right sentence and was reachable only from `module-record-page.tsx`.
   */
  function handleSave(closeAfterSave: boolean) {
    const submission: QuickCreateSubmission = resolveQuickCreateSubmission({
      entity: entity ?? runtime.metadata.entity,
      form,
      values: toFieldValueMap(values),
    });

    if (submission.status === "blocked") {
      setFieldErrors(submission.errors);
      // Every offending field counts as touched, or the renderer holds the
      // error back waiting for a blur that will never come.
      setTouchedFields(new Set(Object.keys(submission.errors)));
      setValidationSummary(submission.summary);
      return;
    }

    setFieldErrors({});
    setTouchedFields(new Set());
    setValidationSummary(null);
    void onSave?.(formValues(values, form), closeAfterSave);
  }

  // A modal side sheet that declared neither `role="dialog"` nor `aria-modal`,
  // handled no Escape, and let Tab walk out into the list behind it. BUG-0043.
  return (
    <Dialog
      footer={
        <>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/20"
            onClick={() => handleSave(false)}
            type="button"
          >
            Save
          </button>
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={() => handleSave(true)}
            type="button"
          >
            Save &amp; Close
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title={title ?? "Quick Create"}
      variant="panel"
    >
      <div className="grid gap-4">
        {error ?? validationSummary ? (
          <p
            className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger"
            role="alert"
          >
            {error ?? validationSummary}
          </p>
        ) : null}
        {form ? (
          <RuntimeMetadataFormRenderer
            entity={entity ?? runtime.metadata.entity}
            form={form}
            dataAdapter={dataAdapter}
            lookupOptions={lookupOptions}
            fieldErrors={fieldErrors}
            mode="new"
            onValuesChange={setDraftValues}
            touchedFields={touchedFields}
            runtime={runtime}
            values={toFieldValueMap(values)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Quick Create form metadata is not available yet.
          </div>
        )}
      </div>
    </Dialog>
  );
}

function formValues(record: RuntimeRecordData, form: FormMetadata | null) {
  if (!form) return record;

  const fieldNames = new Set(
    form.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    ),
  );
  if (!fieldNames.size) return record;

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => fieldNames.has(key)),
  );
}

function toFieldValueMap(record: RuntimeRecordData) {
  const values: Record<
    string,
    string | number | boolean | readonly string[] | null | undefined
  > = {};

  for (const [key, value] of Object.entries(record)) {
    values[key] = isFieldValue(value)
      ? value
      : value == null
        ? null
        : String(value);
  }

  return values;
}

function isFieldValue(
  value: unknown,
): value is string | number | boolean | readonly string[] | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
