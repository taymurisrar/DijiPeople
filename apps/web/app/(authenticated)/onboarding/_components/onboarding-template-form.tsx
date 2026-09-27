"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { CustomFieldsSection } from "@/app/components/runtime/custom-fields-section";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import {
  customFieldErrors,
  customFieldValues,
} from "@/lib/runtime/custom-fields";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  buildOnboardingTemplatePayload,
  createTaskBlueprintRow,
  moveTaskBlueprintRow,
  removeTaskBlueprintRow,
  taskBlueprintRowsFromTemplate,
  validateTemplateForm,
  type TaskBlueprintRow,
} from "../_lib/onboarding-template-form.logic";
import type { OnboardingTemplateRecord, UserListItem } from "../types";

type OnboardingTemplateFormProps = {
  mode: "create" | "edit";
  template?: OnboardingTemplateRecord;
};

export function OnboardingTemplateForm({
  mode,
  template,
}: OnboardingTemplateFormProps) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [rows, setRows] = useState<TaskBlueprintRow[]>(() =>
    taskBlueprintRowsFromTemplate(template),
  );
  const [nextRowKey, setNextRowKey] = useState(rows.length);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    () => customFieldValues(template),
  );
  const [customFieldErrorsByKey, setCustomFieldErrorsByKey] = useState<
    Record<string, string[]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users?pageSize=200")
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload: { items?: UserListItem[] }) => {
        if (!cancelled) setUsers(payload.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(index: number, patch: Partial<TaskBlueprintRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      createTaskBlueprintRow(String(nextRowKey)),
    ]);
    setNextRowKey((current) => current + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateTemplateForm({ name, rows });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = buildOnboardingTemplatePayload({
        name,
        description,
        isDefault,
        isActive,
        rows,
        customFields,
      });

      const response = await fetch(
        mode === "create"
          ? "/api/onboarding/templates"
          : `/api/onboarding/templates/${template?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as {
        message?: string;
        details?: unknown;
      };

      if (!response.ok) {
        setError(data.message ?? `Unable to ${mode} onboarding template.`);
        setCustomFieldErrorsByKey(customFieldErrors(data.details) ?? {});
        setIsSubmitting(false);
        return;
      }

      router.push("/onboarding/templates");
      router.refresh();
    } catch {
      setError("Something went wrong while saving the onboarding template.");
      setIsSubmitting(false);
    }
  }

  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.fullName || user.email,
  }));

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <SectionCard title="Template details">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Name" required value={name} onChange={setName} />
          <div className="flex items-center gap-6 md:justify-self-end md:self-center">
            <CheckboxField
              label="Default template"
              checked={isDefault}
              onChange={setIsDefault}
            />
            <CheckboxField
              label="Active"
              checked={isActive}
              onChange={setIsActive}
            />
          </div>
          <TextAreaField
            className="md:col-span-2"
            label="Description"
            value={description}
            onChange={setDescription}
          />
        </div>
      </SectionCard>

      <SectionCard title="Tasks">
        <div className="grid gap-4">
          {rows.map((row, index) => (
            <div
              className="grid gap-4 rounded-[20px] border border-border bg-white p-4 md:grid-cols-2"
              key={row.key}
            >
              <TextField
                label="Title"
                required
                value={row.title}
                onChange={(value) => updateRow(index, { title: value })}
              />
              <NumberField
                label="Due (days after start)"
                min={0}
                value={row.dueOffsetDays}
                onChange={(value) => updateRow(index, { dueOffsetDays: value })}
              />
              <TextAreaField
                label="Description"
                value={row.description}
                onChange={(value) => updateRow(index, { description: value })}
              />
              <SelectField
                label="Assigned to"
                options={userOptions}
                placeholder="Unassigned"
                value={row.assignedUserId}
                onChange={(value) =>
                  updateRow(index, { assignedUserId: value })
                }
              />
              <div className="flex gap-2 md:col-span-2">
                <Button
                  aria-label="Move task up"
                  disabled={index === 0}
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setRows((current) =>
                      moveTaskBlueprintRow(current, index, "up"),
                    )
                  }
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  aria-label="Move task down"
                  disabled={index === rows.length - 1}
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setRows((current) =>
                      moveTaskBlueprintRow(current, index, "down"),
                    )
                  }
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  aria-label="Remove task"
                  disabled={rows.length <= 1}
                  size="icon-sm"
                  type="button"
                  variant="danger"
                  onClick={() =>
                    setRows((current) => removeTaskBlueprintRow(current, index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" type="button" variant="secondary" onClick={addRow}>
            Add task
          </Button>
        </div>
      </SectionCard>

      <CustomFieldsSection
        errors={customFieldErrorsByKey}
        tableKey="onboardingTemplates"
        value={customFields}
        onChange={setCustomFields}
      />

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <PermissionGate
        permission={
          mode === "create"
            ? PERMISSION_KEYS.ONBOARDING_CREATE
            : PERMISSION_KEYS.ONBOARDING_UPDATE
        }
      >
        <Button disabled={isSubmitting} loading={isSubmitting} type="submit">
          {mode === "create" ? "Create template" : "Save template"}
        </Button>
      </PermissionGate>
    </form>
  );
}
