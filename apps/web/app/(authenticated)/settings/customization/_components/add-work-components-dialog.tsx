"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { CheckboxField } from "@/app/components/ui/form-control";
import {
  WORK_COMPONENT_LABELS,
  buildWorkComponentsPayload,
  selectionId,
  toggleSelection,
  type WorkComponentRef,
  type WorkComponentType,
} from "../_lib/work-components";

type Choice = { key: string; name: string };

type Lists = Record<WorkComponentType, Choice[]>;
type ListErrors = Partial<Record<WorkComponentType, string>>;

const SOURCES: { type: WorkComponentType; path: string }[] = [
  { type: "workUnit", path: "/api/work-profiles/units" },
  { type: "workProfile", path: "/api/work-profiles" },
  { type: "workQueue", path: "/api/work-queues?includeInactive=true" },
];

const GROUP_TITLES: Record<WorkComponentType, string> = {
  workUnit: "Work units",
  workProfile: "Work profiles",
  workQueue: "Work queues",
};

async function readList(path: string): Promise<Choice[]> {
  const response = await fetch(path, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object"
        ? (body as { message?: unknown }).message
        : null;
    throw new Error(
      typeof message === "string" && message
        ? message
        : response.status === 403
          ? "You do not have permission to list these."
          : "The list could not be loaded.",
    );
  }
  const rows = Array.isArray(body) ? body : [];
  return rows
    .filter(
      (row): row is { key: string; name: string } =>
        !!row &&
        typeof row === "object" &&
        typeof (row as { key?: unknown }).key === "string" &&
        typeof (row as { name?: unknown }).name === "string",
    )
    .map((row) => ({ key: row.key, name: row.name }));
}

/**
 * Adds the tenant's work units, profiles and queues to a package. The API owns
 * every rule (permissions, a component already in another package, keys that do
 * not exist); its message is shown as it arrives. Each list loads on its own, so
 * one the viewer may not read does not hide the others.
 */
export function AddWorkComponentsDialog({
  onAdded,
  onClose,
  packageId,
}: {
  onAdded: (added: string[]) => void | Promise<void>;
  onClose: () => void;
  packageId: string;
}) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [listErrors, setListErrors] = useState<ListErrors>({});
  const [selected, setSelected] = useState<WorkComponentRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(SOURCES.map((source) => readList(source.path))).then(
      (results) => {
        if (cancelled) return;
        const next: Lists = { workUnit: [], workProfile: [], workQueue: [] };
        const errors: ListErrors = {};
        results.forEach((result, index) => {
          const { type } = SOURCES[index];
          if (result.status === "fulfilled") next[type] = result.value;
          else
            errors[type] =
              result.reason instanceof Error
                ? result.reason.message
                : "The list could not be loaded.";
        });
        setLists(next);
        setListErrors(errors);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const built = buildWorkComponentsPayload(selected);
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/customization/packages/${encodeURIComponent(packageId)}/work-components`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.body),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        added?: string[];
      };
      if (!response.ok) {
        setError(data.message ?? "The work components could not be added.");
        return;
      }
      await onAdded(data.added ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      busy={saving}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          <Button
            disabled={!selected.length}
            loading={saving}
            onClick={() => void submit()}
          >
            Add selected work components
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title="Add work components"
    >
      <div className="grid gap-5">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {!lists ? (
          <div
            aria-busy="true"
            aria-label="Loading work components"
            className="h-32 animate-pulse rounded-[24px] bg-surface-strong"
            role="status"
          />
        ) : (
          SOURCES.map(({ type }) => (
            <fieldset className="grid gap-2" key={type}>
              <legend className="text-sm font-semibold text-foreground">
                {GROUP_TITLES[type]}
              </legend>
              {listErrors[type] ? (
                <p className="text-sm text-danger" role="alert">
                  {listErrors[type]}
                </p>
              ) : lists[type].length === 0 ? (
                <p className="text-sm text-muted">{`No ${GROUP_TITLES[type].toLowerCase()} in this workspace.`}</p>
              ) : (
                lists[type].map((choice) => {
                  const ref: WorkComponentRef = { type, key: choice.key };
                  return (
                    <CheckboxField
                      checked={selected.some(
                        (entry) => selectionId(entry) === selectionId(ref),
                      )}
                      key={selectionId(ref)}
                      label={`${WORK_COMPONENT_LABELS[type]}: ${choice.name} (${choice.key})`}
                      onChange={() =>
                        setSelected((current) => toggleSelection(current, ref))
                      }
                    />
                  );
                })
              )}
            </fieldset>
          ))
        )}
      </div>
    </Dialog>
  );
}
