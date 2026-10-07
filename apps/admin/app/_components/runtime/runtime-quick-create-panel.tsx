"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanelButton,
  PanelDialog,
} from "@/app/_components/tenants/tenant-panel-ui";
import { backgroundRequestInit } from "@/lib/background-request";
import { readFieldErrors } from "@/lib/runtime/http-module-runtime-adapter";
import {
  humanizeErrorMessage,
  humanizeFieldError,
} from "@/lib/runtime/humanize-field-error";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type {
  PlatformModuleKey,
  RuntimeQuickCreateDefinition,
} from "@/lib/runtime/platform-runtime.types";
import {
  buildQuickCreatePayload,
  createSubmitGuard,
  mapQuickCreateErrors,
  quickCreateFormDefinition,
  quickCreateInitialValues,
  resolveQuickCreateFields,
  resolveQuickCreatePath,
} from "@/lib/runtime/quick-create-model";
import { RuntimeForm, validateRuntimeValues } from "./runtime-form";

/**
 * Create a related record from a subgrid, in a side sheet, without leaving the
 * record (EXECPLAN-0055 D8).
 *
 * The admin console had no quick create: adding a contact, commission or
 * referral link meant navigating away (or, for referral links, was not
 * possible at all). This is the apps/web pattern — a right-edge panel over the
 * record — driven by the subgrid's `quickCreate` declaration. The fields are
 * the child module's own runtime fields, the parent is attached by the
 * declaration rather than chosen, and the subgrid reloads on success while
 * the record page — its tab, its scroll, any unsaved edit — stays as it was.
 *
 * Failures are shown in the panel, next to the field they name. The request is
 * marked as background so the console's blocking error dialog does not cover
 * the same message the panel is already showing beside the field.
 */
export function RuntimeQuickCreatePanel({
  config,
  childModule,
  parentId,
  parent,
  roleKeys,
  onClose,
  onCreated,
}: {
  config: RuntimeQuickCreateDefinition;
  childModule?: PlatformModuleKey;
  parentId: string;
  parent: Record<string, unknown>;
  roleKeys: string[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const fields = useMemo(() => {
    const childForm = childModule
      ? getPlatformModuleDefinition(childModule).forms.find(
          (form) => form.key === "create",
        )
      : undefined;
    return resolveQuickCreateFields(config, childForm?.fields ?? []);
  }, [childModule, config]);
  const formDefinition = useMemo(
    () => quickCreateFormDefinition(fields),
    [fields],
  );
  // The starting values are taken once, when the panel opens.
  const [initialValues] = useState(() =>
    quickCreateInitialValues(config, parent),
  );
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(createSubmitGuard());
  const labels = useMemo(
    () => new Map(fields.map((field) => [field.key, field.label])),
    [fields],
  );

  const submit = useCallback(
    async (addAnother: boolean) => {
      if (!guard.current.tryAcquire()) return;
      setBusy(true);
      setMessage(null);
      setNotice(null);
      try {
        const clientErrors = validateRuntimeValues(formDefinition, values);
        setErrors(clientErrors);
        if (Object.keys(clientErrors).length) return;
        const response = await fetch(
          resolveQuickCreatePath(config, parentId),
          backgroundRequestInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildQuickCreatePayload(config, fields, values, parentId),
            ),
          }),
        );
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!response.ok) {
          const mapped = mapQuickCreateErrors(
            fields,
            typeof payload?.message === "string"
              ? humanizeErrorMessage(payload.message)
              : "",
            (readFieldErrors(payload) ?? []).map((item) => ({
              field: item.field,
              message: item.field
                ? humanizeErrorMessage(
                    humanizeFieldError(
                      item.field,
                      item.message,
                      labels.get(item.field),
                    ),
                  )
                : item.message,
            })),
          );
          setErrors(mapped.fieldErrors);
          setMessage(mapped.message);
          return;
        }
        await onCreated();
        if (addAnother) {
          setValues(initialValues);
          setErrors({});
          setNotice("Saved. Add the next one.");
        } else onClose();
      } catch {
        setMessage(
          "The record could not be created. Check your connection and try again.",
        );
      } finally {
        guard.current.release();
        setBusy(false);
      }
    },
    [
      config,
      fields,
      formDefinition,
      initialValues,
      labels,
      onClose,
      onCreated,
      parentId,
      values,
    ],
  );

  return (
    <PanelDialog
      title={config.title}
      onClose={onClose}
      variant="sheet"
      footer={
        <>
          <PanelButton onClick={onClose} disabled={busy}>
            Cancel
          </PanelButton>
          {config.addAnother !== false ? (
            <PanelButton onClick={() => void submit(true)} busy={busy}>
              Save and add another
            </PanelButton>
          ) : null}
          <PanelButton
            variant="primary"
            onClick={() => void submit(false)}
            busy={busy}
          >
            Save
          </PanelButton>
        </>
      }
    >
      {message ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {message}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      <RuntimeForm
        definition={formDefinition}
        values={values}
        mode="create"
        roleKeys={roleKeys}
        errors={errors}
        onChange={(field, value) => {
          setValues((current) => ({ ...current, [field]: value }));
          setErrors((current) => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
          });
        }}
        onSubmit={() => void submit(false)}
        bare
        fieldIdPrefix="quick-create"
      />
    </PanelDialog>
  );
}
