"use client";

import { FormEvent, useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { BusinessUnitRecord, OrganizationRecord } from "../types";

type BusinessUnitManagementProps = {
  initialBusinessUnits: BusinessUnitRecord[];
  initialOrganizations: OrganizationRecord[];
};

type BusinessUnitFormState = {
  name: string;
  organizationId: string;
  parentBusinessUnitId: string;
};

export function BusinessUnitManagement({
  initialBusinessUnits,
  initialOrganizations,
}: BusinessUnitManagementProps) {
  const [businessUnits, setBusinessUnits] = useState(initialBusinessUnits);
  const [organizations] = useState(initialOrganizations);
  const [form, setForm] = useState<BusinessUnitFormState>({
    name: "",
    organizationId: initialOrganizations[0]?.id ?? "",
    parentBusinessUnitId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessUnitRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const businessUnitTree = useMemo(
    () => buildBusinessUnitTree(
      businessUnits.filter((unit) => unit.organizationId === form.organizationId),
    ),
    [businessUnits, form.organizationId],
  );

  const groupedByOrganization = useMemo(() => {
    const map = new Map<string, BusinessUnitRecord[]>();
    for (const organization of organizations) {
      map.set(
        organization.id,
        businessUnits.filter((unit) => unit.organizationId === organization.id),
      );
    }
    return map;
  }, [businessUnits, organizations]);

  const parentOptions = useMemo(
    () => toBusinessUnitOptions(businessUnitTree),
    [businessUnitTree],
  );

  function startCreate() {
    setEditingId(null);
    setForm((current) => ({
      ...current,
      name: "",
      parentBusinessUnitId: "",
    }));
    setError(null);
    setMessage(null);
  }

  function startEdit(unit: BusinessUnitRecord) {
    setEditingId(unit.id);
    setForm({
      name: unit.name,
      organizationId: unit.organizationId,
      parentBusinessUnitId: unit.parentBusinessUnitId ?? "",
    });
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!form.name.trim()) {
      setError("Business unit name is required.");
      return;
    }

    if (!form.organizationId) {
      setError("Organization is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        organizationId: form.organizationId,
        parentBusinessUnitId: form.parentBusinessUnitId || null,
      };

      const response = await fetch(
        editingId ? `/api/business-units/${editingId}` : "/api/business-units",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | BusinessUnitRecord
        | { message?: string }
        | null;

      if (!response.ok || !data || !("id" in data)) {
        setError(
          data && "message" in data
            ? data.message ?? "Unable to save business unit."
            : "Unable to save business unit.",
        );
        return;
      }

      setBusinessUnits((current) =>
        current.some((item) => item.id === data.id)
          ? current.map((item) => (item.id === data.id ? data : item))
          : [...current, data],
      );
      startCreate();
      setMessage(editingId ? "Business unit updated." : "Business unit created.");
    } catch {
      setError("Unable to save business unit. Check that the API is running.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/business-units/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;

      if (!response.ok || !data?.deleted) {
        setError(data?.message ?? "Unable to delete business unit.");
        return;
      }

      setBusinessUnits((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      if (editingId === deleteTarget.id) {
        startCreate();
      }
      setDeleteTarget(null);
      setMessage("Business unit deleted.");
    } catch {
      setError("Unable to delete business unit. Check that the API is running.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="grid gap-6">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Business Unit Hierarchy
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Manage business units
            </h3>
          </div>
          <Button onClick={startCreate} type="button" variant="secondary">
            New business unit
          </Button>
        </div>

        <div className="mt-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">
              Show hierarchy for organization
            </span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  organizationId: event.target.value,
                  parentBusinessUnitId: "",
                }))
              }
              value={form.organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {businessUnitTree.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-border bg-white/80 p-5 text-sm text-muted">
            No business units in this organization yet.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {businessUnitTree.map((node) => (
              <BusinessUnitTreeItem
                key={node.id}
                node={node}
                onDelete={setDeleteTarget}
                onEdit={startEdit}
              />
            ))}
          </div>
        )}
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          {editingId ? "Edit Business Unit" : "Create Business Unit"}
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          {editingId ? "Update business unit" : "Add business unit"}
        </h3>

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Name *</span>
            <input
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Operations BU"
              value={form.name}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Organization *</span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  organizationId: event.target.value,
                  parentBusinessUnitId: "",
                }))
              }
              value={form.organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Parent business unit</span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  parentBusinessUnitId: event.target.value,
                }))
              }
              value={form.parentBusinessUnitId}
            >
              <option value="">No parent (root)</option>
              {parentOptions
                .filter((option) => option.id !== editingId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>

          {error ? (
            <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button loading={isSubmitting} loadingText="Saving..." type="submit">
              {editingId ? "Save business unit" : "Create business unit"}
            </Button>
            {editingId ? (
              <Button onClick={startCreate} type="button" variant="secondary">
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </article>

      <ConfirmDialog
        confirmAction={{
          label: "Delete business unit",
          onClick: handleConfirmDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This action is blocked if child business units or users are assigned.`
            : undefined
        }
        isLoading={isDeleting}
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete business unit"
      />

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Directory by Organization
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          Business units
        </h3>
        <div className="mt-4 grid gap-4">
          {organizations.map((organization) => (
            <div
              key={organization.id}
              className="rounded-2xl border border-border bg-white p-4"
            >
              <p className="font-medium text-foreground">{organization.name}</p>
              <p className="mt-1 text-sm text-muted">
                {groupedByOrganization.get(organization.id)?.length ?? 0} business
                units
              </p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

type BusinessUnitNode = BusinessUnitRecord & {
  children: BusinessUnitNode[];
};

function buildBusinessUnitTree(records: BusinessUnitRecord[]) {
  const nodeMap = new Map<string, BusinessUnitNode>(
    records.map((record) => [record.id, { ...record, children: [] }]),
  );
  const roots: BusinessUnitNode[] = [];

  nodeMap.forEach((node) => {
    if (node.parentBusinessUnitId && nodeMap.has(node.parentBusinessUnitId)) {
      nodeMap.get(node.parentBusinessUnitId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortTree = (nodes: BusinessUnitNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortTree(node.children));
    return nodes;
  };

  return sortTree(roots);
}

function toBusinessUnitOptions(nodes: BusinessUnitNode[], depth = 0) {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${"  ".repeat(depth)}${depth > 0 ? "↳ " : ""}${node.name}`,
    },
    ...toBusinessUnitOptions(node.children, depth + 1),
  ]);
}

function BusinessUnitTreeItem({
  node,
  onDelete,
  onEdit,
}: {
  node: BusinessUnitNode;
  onDelete: (businessUnit: BusinessUnitRecord) => void;
  onEdit: (businessUnit: BusinessUnitRecord) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/85 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{node.name}</p>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {node.parentBusinessUnitId ? "Child business unit" : "Root business unit"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onEdit(node)} size="sm" type="button" variant="secondary">
            Edit
          </Button>
          <Button onClick={() => onDelete(node)} size="sm" type="button" variant="danger">
            Delete
          </Button>
        </div>
      </div>
      {node.children.length > 0 ? (
        <div className="mt-3 space-y-2 border-l border-border pl-4">
          {node.children.map((child) => (
            <BusinessUnitTreeItem
              key={child.id}
              node={child}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
