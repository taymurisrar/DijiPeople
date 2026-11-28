"use client";
 

import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  CheckboxField,
  DateField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  MEASUREMENT_MODE_LABELS,
  WORK_KEY_PATTERN,
  WORK_TYPE_KIND_LABELS,
  definitionFromDrafts,
  draftsFromDefinition,
  isoFromDateInput,
  keyFromName,
  validateDrafts,
  type WorkTypeDraft,
  type WorkUnit,
} from "../_lib/work-profile-form";
import {
  workProfilesRequest,
  type ExportedPackage,
  type WorkProfileDetail,
  type WorkProfileVersion,
} from "../_lib/work-profiles-client";
import { WorkTypeEditor } from "./work-type-editor";

const SUMMARY_COLUMNS: DataTableColumn<WorkTypeDraft>[] = [
  { key: "name", header: "Work type", render: (row) => row.name },
  {
    key: "kind",
    header: "Kind",
    render: (row) => WORK_TYPE_KIND_LABELS[row.kind],
  },
  {
    key: "mode",
    header: "Measured",
    render: (row) => MEASUREMENT_MODE_LABELS[row.measurementMode],
  },
  { key: "unit", header: "Unit", render: (row) => row.unitKey },
  {
    key: "effort",
    header: "Standard effort (min)",
    render: (row) => row.standardEffortMinutes ?? "",
  },
];

const VERSION_COLUMNS: DataTableColumn<WorkProfileVersion>[] = [
  { key: "version", header: "Version", render: (row) => `v${row.version}` },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusPill tone={row.status === "PUBLISHED" ? "good" : "warning"}>
        {row.status === "PUBLISHED" ? "Published" : "Draft"}
      </StatusPill>
    ),
  },
  {
    key: "from",
    header: "Effective from",
    render: (row) => (row.effectiveFrom ? formatDate(row.effectiveFrom) : ""),
  },
  {
    key: "to",
    header: "Effective to",
    render: (row) => (row.effectiveTo ? formatDate(row.effectiveTo) : ""),
  },
];

function download(file: ExportedPackage) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Create a profile, or open one: edit its details, work on the open draft,
 * publish it, start the next draft, or export the published version as a
 * `.djpkg`. A published version is never edited; changing a profile means
 * publishing the next one (ADR-0030), so there is no way to edit it here.
 */
export function WorkProfileDialog({
  canManage,
  onChanged,
  onClose,
  open,
  profileId,
  units,
}: {
  canManage: boolean;
  onChanged: () => void;
  onClose: () => void;
  open: boolean;
  /** `null` creates a new profile. */
  profileId: string | null;
  units: WorkUnit[];
}) {
  const [currentId, setCurrentId] = useState<string | null>(profileId);
  const [detail, setDetail] = useState<WorkProfileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [drafts, setDrafts] = useState<WorkTypeDraft[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");

  const adopt = useCallback((next: WorkProfileDetail) => {
    setDetail(next);
    setName(next.name);
    setDescription(next.description ?? "");
    setIsActive(next.isActive);
    const draft = next.versions.find((v) => v.status === "DRAFT");
    setDrafts(draft ? draftsFromDefinition(draft.definition) : []);
    setProblems([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCurrentId(profileId);
    setDetail(null);
    setError(null);
    setProblems([]);
    setKey("");
    setName("");
    setDescription("");
    setIsActive(true);
    setDrafts([]);
    setEffectiveFrom("");
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    workProfilesRequest<WorkProfileDetail>(`/${profileId}`)
      .then((loaded) => {
        if (!cancelled) adopt(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load the profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profileId, adopt]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const draftVersion = detail?.versions.find((v) => v.status === "DRAFT");
  const publishedVersions = detail?.versions.filter(
    (v) => v.status === "PUBLISHED",
  );
  const latestPublished = publishedVersions?.[0];

  const checked = (): boolean => {
    const found = validateDrafts(drafts, units);
    setProblems(found);
    return found.length === 0;
  };

  const create = () =>
    run(async () => {
      if (!WORK_KEY_PATTERN.test(key.trim()) || !name.trim()) {
        setProblems([
          "A profile needs a name and a key of 2-64 characters (a-z, 0-9, \".\", \"_\" or \"-\").",
        ]);
        return;
      }
      if (!checked()) return;
      const created = await workProfilesRequest<WorkProfileDetail>("", {
        method: "POST",
        body: {
          key: key.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          definition: definitionFromDrafts(drafts),
        },
      });
      setCurrentId(created.id);
      adopt(created);
      onChanged();
    });

  const saveDetails = () =>
    run(async () => {
      if (!currentId) return;
      adopt(
        await workProfilesRequest<WorkProfileDetail>(`/${currentId}`, {
          method: "PATCH",
          body: { name: name.trim(), description: description.trim(), isActive },
        }),
      );
      onChanged();
    });

  const startDraft = () =>
    run(async () => {
      if (!currentId) return;
      adopt(
        await workProfilesRequest<WorkProfileDetail>(`/${currentId}/versions`, {
          method: "POST",
        }),
      );
      onChanged();
    });

  const saveDraft = async (): Promise<boolean> => {
    if (!currentId || !draftVersion) return false;
    if (!checked()) return false;
    adopt(
      await workProfilesRequest<WorkProfileDetail>(
        `/${currentId}/versions/${draftVersion.id}`,
        { method: "PATCH", body: { definition: definitionFromDrafts(drafts) } },
      ),
    );
    return true;
  };

  const publish = () =>
    run(async () => {
      if (!currentId || !draftVersion) return;
      if (!(await saveDraft())) return;
      adopt(
        await workProfilesRequest<WorkProfileDetail>(
          `/${currentId}/versions/${draftVersion.id}/publish`,
          {
            method: "POST",
            body: effectiveFrom
              ? { effectiveFrom: isoFromDateInput(effectiveFrom) }
              : {},
          },
        ),
      );
      setEffectiveFrom("");
      onChanged();
    });

  const exportPackage = () =>
    run(async () => {
      if (!currentId) return;
      download(
        await workProfilesRequest<ExportedPackage>(`/${currentId}/export`),
      );
    });

  const creating = currentId === null;
  const title = creating ? "New work profile" : (detail?.name ?? "Work profile");

  return (
    <Dialog
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
          {canManage && creating ? (
            <Button loading={busy} onClick={create}>
              Create profile
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title={title}
    >
      <div className="grid gap-6">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm text-danger" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        {loading ? (
          <div
            aria-busy="true"
            className="h-40 animate-pulse rounded-[22px] bg-surface-strong"
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={!canManage}
                label="Name"
                onChange={(value) => {
                  if (creating && key === keyFromName(name)) {
                    setKey(keyFromName(value));
                  }
                  setName(value);
                }}
                required
                value={name}
              />
              {creating ? (
                <TextField
                  label="Key"
                  onChange={setKey}
                  required
                  value={key}
                />
              ) : (
                <TextField
                  disabled
                  label="Key"
                  onChange={() => undefined}
                  value={detail?.key ?? ""}
                />
              )}
              <TextAreaField
                className="md:col-span-2"
                disabled={!canManage}
                label="Description"
                onChange={setDescription}
                rows={2}
                value={description}
              />
              {!creating ? (
                <CheckboxField
                  checked={isActive}
                  disabled={!canManage}
                  label="Active"
                  onChange={setIsActive}
                />
              ) : null}
            </div>
            {!creating && canManage ? (
              <div>
                <Button
                  loading={busy}
                  onClick={saveDetails}
                  size="sm"
                  variant="outline"
                >
                  Save details
                </Button>
              </div>
            ) : null}

            {creating ? (
              <section className="grid gap-3">
                <h3 className="text-base font-semibold text-foreground">
                  Work types
                </h3>
                <WorkTypeEditor
                  drafts={drafts}
                  onChange={setDrafts}
                  units={units}
                />
              </section>
            ) : (
              <>
                <section className="grid gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    Versions
                  </h3>
                  <DataTable
                    columns={VERSION_COLUMNS}
                    enableSearch={false}
                    entityLogicalName="work-profile-versions"
                    getRowKey={(row) => row.id}
                    rows={detail?.versions ?? []}
                  />
                </section>

                {draftVersion ? (
                  <section className="grid gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      Draft v{draftVersion.version}
                    </h3>
                    <WorkTypeEditor
                      disabled={!canManage}
                      drafts={drafts}
                      onChange={setDrafts}
                      units={units}
                    />
                    {canManage ? (
                      <div className="flex flex-wrap items-end gap-3">
                        <DateField
                          label="Effective from"
                          onChange={setEffectiveFrom}
                          value={effectiveFrom}
                        />
                        <Button
                          loading={busy}
                          onClick={() => run(async () => void (await saveDraft()))}
                          variant="outline"
                        >
                          Save draft
                        </Button>
                        <Button loading={busy} onClick={publish}>
                          Publish
                        </Button>
                      </div>
                    ) : null}
                  </section>
                ) : latestPublished ? (
                  <section className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground">
                        Published v{latestPublished.version}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {canManage ? (
                          <>
                            <Button
                              leftIcon={<Download className="h-4 w-4" />}
                              loading={busy}
                              onClick={exportPackage}
                              size="sm"
                              variant="outline"
                            >
                              Export
                            </Button>
                            <Button
                              loading={busy}
                              onClick={startDraft}
                              size="sm"
                            >
                              New draft
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <DataTable
                      columns={SUMMARY_COLUMNS}
                      enableSearch={false}
                      entityLogicalName="work-profile-work-types"
                      getRowKey={(row) => row.key}
                      rows={draftsFromDefinition(latestPublished.definition)}
                    />
                  </section>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
