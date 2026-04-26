"use client";

import { FormEvent, useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { OrganizationRecord } from "../types";

type OrganizationManagementProps = {
  initialOrganizations: OrganizationRecord[];
};

type OrganizationFormState = {
  name: string;
  parentOrganizationId: string;
};

export function OrganizationManagement({
  initialOrganizations,
}: OrganizationManagementProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [form, setForm] = useState<OrganizationFormState>({
    name: "",
    parentOrganizationId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const organizationTree = useMemo(
    () => buildOrganizationTree(organizations),
    [organizations],
  );

  const parentOptions = useMemo(
    () => toOrganizationOptions(organizationTree),
    [organizationTree],
  );

  const sortedOrganizations = useMemo(
    () => [...organizations].sort((a, b) => a.name.localeCompare(b.name)),
    [organizations],
  );

  function startCreate() {
    setEditingId(null);
    setForm({ name: "", parentOrganizationId: "" });
    setError(null);
    setMessage(null);
  }

  function startEdit(organization: OrganizationRecord) {
    setEditingId(organization.id);
    setForm({
      name: organization.name,
      parentOrganizationId: organization.parentOrganizationId ?? "",
    });
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!form.name.trim()) {
      setError("Organization name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        parentOrganizationId: form.parentOrganizationId || null,
      };

      const response = await fetch(
        editingId ? `/api/organizations/${editingId}` : "/api/organizations",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | OrganizationRecord
        | { message?: string }
        | null;

      if (!response.ok || !data || !("id" in data)) {
        setError(
          data && "message" in data
            ? data.message ?? "Unable to save organization."
            : "Unable to save organization.",
        );
        return;
      }

      setOrganizations((current) =>
        current.some((item) => item.id === data.id)
          ? current.map((item) => (item.id === data.id ? data : item))
          : [...current, data],
      );
      startCreate();
      setMessage(editingId ? "Organization updated." : "Organization created.");
    } catch {
      setError("Unable to save organization. Check that the API is running.");
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
      const response = await fetch(`/api/organizations/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;

      if (!response.ok || !data?.deleted) {
        setError(data?.message ?? "Unable to delete organization.");
        return;
      }

      setOrganizations((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      if (editingId === deleteTarget.id) {
        startCreate();
      }
      setDeleteTarget(null);
      setMessage("Organization deleted.");
    } catch {
      setError("Unable to delete organization. Check that the API is running.");
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
              Organization Hierarchy
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Manage organizations
            </h3>
          </div>
          <Button onClick={startCreate} variant="secondary" type="button">
            New organization
          </Button>
        </div>

        {organizationTree.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-border bg-white/80 p-5 text-sm text-muted">
            No organizations yet. Create the first organization to start building
            your structure.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {organizationTree.map((node) => (
              <OrganizationTreeItem
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
          {editingId ? "Edit Organization" : "Create Organization"}
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          {editingId ? "Update organization" : "Add organization"}
        </h3>

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Name *</span>
            <input
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Corporate Group"
              value={form.name}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Parent organization</span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  parentOrganizationId: event.target.value,
                }))
              }
              value={form.parentOrganizationId}
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
              {editingId ? "Save organization" : "Create organization"}
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
          label: "Delete organization",
          onClick: handleConfirmDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This action is blocked if child organizations or business units exist.`
            : undefined
        }
        isLoading={isDeleting}
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete organization"
      />

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Flat Directory
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">
          All organizations
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Parent</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrganizations.map((organization) => (
                <tr key={organization.id}>
                  <td className="rounded-l-2xl border border-border bg-white px-3 py-3 text-sm font-medium text-foreground">
                    {organization.name}
                  </td>
                  <td className="border-y border-border bg-white px-3 py-3 text-sm text-muted">
                    {findOrganizationName(
                      organizations,
                      organization.parentOrganizationId,
                    ) ?? "Root"}
                  </td>
                  <td className="rounded-r-2xl border border-border bg-white px-3 py-3 text-sm text-muted">
                    {new Date(organization.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

type OrganizationNode = OrganizationRecord & {
  children: OrganizationNode[];
};

type OrganizationOption = {
  id: string;
  label: string;
};

function buildOrganizationTree(records: OrganizationRecord[]) {
  const nodeMap = new Map<string, OrganizationNode>(
    records.map((record) => [record.id, { ...record, children: [] }]),
  );
  const roots: OrganizationNode[] = [];

  nodeMap.forEach((node) => {
    if (node.parentOrganizationId && nodeMap.has(node.parentOrganizationId)) {
      nodeMap.get(node.parentOrganizationId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortTree = (nodes: OrganizationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortTree(node.children));
    return nodes;
  };

  return sortTree(roots);
}

function toOrganizationOptions(
  nodes: OrganizationNode[],
  depth = 0,
): OrganizationOption[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${"  ".repeat(depth)}${depth > 0 ? "↳ " : ""}${node.name}`,
    },
    ...toOrganizationOptions(node.children, depth + 1),
  ]);
}

function findOrganizationName(
  organizations: OrganizationRecord[],
  organizationId: string | null,
) {
  if (!organizationId) {
    return null;
  }
  return organizations.find((item) => item.id === organizationId)?.name ?? null;
}

function OrganizationTreeItem({
  node,
  onDelete,
  onEdit,
}: {
  node: OrganizationNode;
  onDelete: (organization: OrganizationRecord) => void;
  onEdit: (organization: OrganizationRecord) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/85 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{node.name}</p>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {node.parentOrganizationId ? "Child organization" : "Root organization"}
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
            <OrganizationTreeItem
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
