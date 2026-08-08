"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import {
  Workflow,
  WorkflowAction,
  WorkflowBuilderOptions,
  WorkflowCondition,
  WorkflowStatus,
  createWorkflow,
  updateWorkflow,
} from "@/lib/workflows-api";
import {
  ScopePicker,
  ScopeValue,
  validateScope,
} from "../../_components/scope-picker";
import {
  ErrorBanner,
  Field,
  inputClassName,
  SettingsPanel,
} from "../../notifications/_components/notification-ui";

/*
 * Authors a workflow: when this event happens, to records in this part of the
 * organization, send these emails.
 *
 * The scope and module controls are the same ones the email template editor
 * uses, so a user who has placed a template already knows how to place a
 * workflow.
 */

type ActionDraft = Omit<WorkflowAction, "id">;

const EMPTY_ACTION: ActionDraft = {
  type: "SEND_EMAIL",
  sortOrder: 0,
  isActive: true,
  templateId: null,
  templateKey: null,
  recipientMode: "SUBJECT",
  recipientAddress: null,
};

export function WorkflowBuilder({
  options,
  workflow,
}: {
  options: WorkflowBuilderOptions;
  workflow?: Workflow | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(workflow);

  const [form, setForm] = useState({
    name: workflow?.name ?? "",
    description: workflow?.description ?? "",
    eventCode: workflow?.eventCode ?? options.events[0]?.value ?? "",
    status: (workflow?.status ?? "DRAFT") as WorkflowStatus,
  });
  const [scope, setScope] = useState<ScopeValue>({
    scopeLevel:
      workflow && workflow.scopeLevel !== "SYSTEM"
        ? workflow.scopeLevel
        : "TENANT",
    scopeId: workflow?.scopeId ?? null,
    moduleKey: workflow?.moduleKey ?? null,
  });
  const [conditions, setConditions] = useState<WorkflowCondition[]>(
    workflow?.conditions ?? [],
  );
  const [actions, setActions] = useState<ActionDraft[]>(
    workflow?.actions.length
      ? workflow.actions.map((action) => ({ ...action }))
      : [{ ...EMPTY_ACTION }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * The scope picker takes the template options shape. Reusing it keeps one
   * control for both screens rather than a near-copy that drifts.
   */
  const scopeOptions = useMemo<TemplateScopeOptions>(
    () => ({
      levels: options.levels,
      organizations: options.organizations,
      businessUnits: options.businessUnits,
      departments: options.departments,
      teams: options.teams,
      modules: options.modules,
    }),
    [options],
  );

  const selectedEvent = options.events.find(
    (event) => event.value === form.eventCode,
  );

  function updateAction(index: number, patch: Partial<ActionDraft>) {
    setActions((current) =>
      current.map((action, position) =>
        position === index ? { ...action, ...patch } : action,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Give the workflow a name.");
    if (!form.eventCode) return setError("Choose the event that triggers it.");

    const scopeError = validateScope(scope);
    if (scopeError) return setError(scopeError);

    if (!actions.length) return setError("Add at least one action.");
    for (const action of actions) {
      if (!action.templateId) {
        return setError("Choose an email template for every action.");
      }
      if (action.recipientMode === "FIXED" && !action.recipientAddress?.trim()) {
        return setError(
          "Enter the address to send to when using a fixed recipient.",
        );
      }
    }

    const cleanConditions = conditions.filter((condition) =>
      condition.field.trim(),
    );

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      eventCode: form.eventCode,
      status: form.status,
      scopeLevel: scope.scopeLevel,
      scopeId: scope.scopeId,
      moduleKey: scope.moduleKey,
      conditions: cleanConditions,
      actions: actions.map((action, index) => ({
        type: action.type,
        sortOrder: index,
        isActive: action.isActive,
        templateId: action.templateId,
        recipientMode: action.recipientMode,
        recipientAddress: action.recipientAddress?.trim() || null,
      })),
    };

    setBusy(true);
    try {
      if (workflow) {
        await updateWorkflow(workflow.id, payload);
        router.refresh();
        setBusy(false);
        setError(null);
      } else {
        const created = await createWorkflow(payload);
        router.push(
          `/settings/approvals/templates/workflow-templates/${created.id}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save workflow.");
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <ErrorBanner message={error} />

      <SettingsPanel
        title="Trigger"
        description="The workflow runs whenever this event happens in the part of the organization you choose below."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" required>
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Email HR when engineering requests leave"
              value={form.name}
            />
          </Field>
          <Field label="When this happens" required>
            <select
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  eventCode: event.target.value,
                }))
              }
              value={form.eventCode}
            >
              {options.events.map((event) => (
                <option key={event.value} value={event.value}>
                  {event.label}
                </option>
              ))}
            </select>
            {selectedEvent?.description ? (
              <span className="mt-1 block text-xs text-muted">
                {selectedEvent.description}
              </span>
            ) : null}
          </Field>
          <Field label="Description">
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              value={form.description}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as WorkflowStatus,
                }))
              }
              value={form.status}
            >
              <option value="DRAFT">Draft - does not run</option>
              <option value="ACTIVE">Active - runs on this event</option>
              <option value="INACTIVE">Paused - keeps its setup</option>
            </select>
          </Field>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Where it applies"
        description="Leave this on the whole tenant to cover everyone, or narrow it to one organization, business unit, department or team. Limiting it to a module means it only runs for events from that module."
      >
        <ScopePicker
          onChange={setScope}
          options={scopeOptions}
          value={scope}
        />
      </SettingsPanel>

      <SettingsPanel
        title="Only when"
        description="Optional tests against the event's details. Leave empty to run every time. All tests must pass."
      >
        <div className="grid gap-3">
          {conditions.map((condition, index) => (
            <div
              className="grid gap-3 rounded-2xl border border-border bg-white p-3 md:grid-cols-[1fr_170px_1fr_auto]"
              key={`condition-${index}`}
            >
              <input
                className={inputClassName}
                onChange={(event) =>
                  setConditions((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, field: event.target.value }
                        : entry,
                    ),
                  )
                }
                placeholder="leaveTypeName"
                value={condition.field}
              />
              <select
                className={inputClassName}
                onChange={(event) =>
                  setConditions((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, operator: event.target.value }
                        : entry,
                    ),
                  )
                }
                value={condition.operator}
              >
                {options.conditionOperators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <input
                className={inputClassName}
                disabled={
                  condition.operator === "isEmpty" ||
                  condition.operator === "isNotEmpty"
                }
                onChange={(event) =>
                  setConditions((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, value: event.target.value }
                        : entry,
                    ),
                  )
                }
                placeholder="Annual Leave"
                value={condition.value ?? ""}
              />
              <Button
                onClick={() =>
                  setConditions((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
                size="sm"
                type="button"
                variant="danger"
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              onClick={() =>
                setConditions((current) => [
                  ...current,
                  { field: "", operator: "equals", value: "" },
                ])
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              Add Condition
            </Button>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Then send"
        description="Each action sends one email template. The template is resolved for the record's placement, so a team template still wins over the tenant default."
      >
        <div className="grid gap-4">
          {actions.map((action, index) => (
            <div
              className="grid gap-4 rounded-2xl border border-border bg-white p-4 md:grid-cols-3"
              key={`action-${index}`}
            >
              <Field label="Email template" required>
                <select
                  className={inputClassName}
                  onChange={(event) =>
                    updateAction(index, {
                      templateId: event.target.value || null,
                    })
                  }
                  value={action.templateId ?? ""}
                >
                  <option value="">Select a template</option>
                  {options.templates.map((template) => (
                    <option key={template.value} value={template.value}>
                      {template.label}
                    </option>
                  ))}
                </select>
                {options.templates.length ? null : (
                  <span className="mt-1 block text-xs text-muted">
                    No active templates exist yet. Create and activate one
                    first.
                  </span>
                )}
              </Field>
              <Field label="Send to">
                <select
                  className={inputClassName}
                  onChange={(event) =>
                    updateAction(index, {
                      recipientMode: event.target
                        .value as ActionDraft["recipientMode"],
                    })
                  }
                  value={action.recipientMode}
                >
                  {options.recipientModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Address"
                required={action.recipientMode === "FIXED"}
              >
                <input
                  className={inputClassName}
                  disabled={action.recipientMode !== "FIXED"}
                  onChange={(event) =>
                    updateAction(index, {
                      recipientAddress: event.target.value,
                    })
                  }
                  placeholder={
                    action.recipientMode === "FIXED"
                      ? "hr@example.com"
                      : "Resolved from the record"
                  }
                  type="email"
                  value={action.recipientAddress ?? ""}
                />
              </Field>
              {actions.length > 1 ? (
                <div className="md:col-span-3">
                  <Button
                    onClick={() =>
                      setActions((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="danger"
                  >
                    Remove Action
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <div>
            <Button
              onClick={() =>
                setActions((current) => [
                  ...current,
                  { ...EMPTY_ACTION, sortOrder: current.length },
                ])
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              Add Action
            </Button>
          </div>
        </div>
      </SettingsPanel>

      <div className="flex justify-end gap-3">
        <Button
          href="/settings/approvals/templates/workflow-templates"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
        <Button loading={busy} type="submit">
          {isEdit ? "Save Workflow" : "Create Workflow"}
        </Button>
      </div>
    </form>
  );
}
