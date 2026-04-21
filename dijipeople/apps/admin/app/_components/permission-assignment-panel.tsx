"use client";

import { useEffect, useMemo, useState } from "react";

type PermissionItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type AssignmentSubject = {
  id: string;
  label: string;
  meta: string;
  permissionIds: string[];
  patchUrl: string;
};

type PermissionAssignmentPanelProps = {
  emptyMessage: string;
  permissions: PermissionItem[];
  subjects: AssignmentSubject[];
  title: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PermissionAssignmentPanel({
  emptyMessage,
  permissions,
  subjects,
  title,
}: PermissionAssignmentPanelProps) {
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(
    subjects[0]?.id ?? null,
  );
  const [subjectStates, setSubjectStates] = useState<Record<string, string[]>>(
    () =>
      Object.fromEntries(
        subjects.map((subject) => [subject.id, [...subject.permissionIds]]),
      ),
  );
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    setSubjectStates(
      Object.fromEntries(
        subjects.map((subject) => [subject.id, [...subject.permissionIds]]),
      ),
    );

    if (!subjects.some((subject) => subject.id === openSubjectId)) {
      setOpenSubjectId(subjects[0]?.id ?? null);
    }
  }, [subjects, openSubjectId]);

  const groupedPermissions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const visiblePermissions = permissions.filter((permission) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack =
        `${permission.key} ${permission.name} ${permission.description ?? ""}`.toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return Object.entries(
      visiblePermissions.reduce<Record<string, PermissionItem[]>>((groups, permission) => {
        const groupKey = permission.key.split(".")[0] ?? "other";
        groups[groupKey] ??= [];
        groups[groupKey].push(permission);
        return groups;
      }, {}),
    )
      .map(([groupName, items]) => [
        groupName,
        [...items].sort((left, right) => left.name.localeCompare(right.name)),
      ] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  }, [permissions, search]);

  async function handleSave(subjectId: string) {
    setSavingId(subjectId);
    setMessages((current) => ({ ...current, [subjectId]: "" }));

    const subject = subjects.find((item) => item.id === subjectId);

    if (!subject) {
      setMessages((current) => ({
        ...current,
        [subjectId]: "Unable to resolve permission target.",
      }));
      setSavingId(null);
      return;
    }

    try {
      const response = await fetch(subject.patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionIds: subjectStates[subjectId] ?? [],
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      setMessages((current) => ({
        ...current,
        [subjectId]: response.ok
          ? "Permissions updated successfully."
          : data?.message ?? "Unable to update permissions.",
      }));
    } catch {
      setMessages((current) => ({
        ...current,
        [subjectId]: "Something went wrong while saving permissions.",
      }));
    } finally {
      setSavingId(null);
    }
  }

  function togglePermission(subjectId: string, permissionId: string) {
    setSubjectStates((current) => {
      const selected = new Set(current[subjectId] ?? []);

      if (selected.has(permissionId)) {
        selected.delete(permissionId);
      } else {
        selected.add(permissionId);
      }

      return {
        ...current,
        [subjectId]: Array.from(selected),
      };
    });
  }

  function setGroupSelection(
    subjectId: string,
    groupPermissionIds: string[],
    checked: boolean,
  ) {
    setSubjectStates((current) => {
      const selected = new Set(current[subjectId] ?? []);

      for (const permissionId of groupPermissionIds) {
        if (checked) {
          selected.add(permissionId);
        } else {
          selected.delete(permissionId);
        }
      }

      return {
        ...current,
        [subjectId]: Array.from(selected),
      };
    });
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">
            Search permissions and assign access without flooding the page with open matrices.
          </p>
        </div>

        <label className="w-full max-w-sm space-y-2 text-sm text-slate-700">
          <span className="font-medium">Search permissions</span>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by key, name, or module"
            value={search}
          />
        </label>
      </div>

      {subjects.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {subjects.map((subject) => {
            const isOpen = openSubjectId === subject.id;
            const selectedCount = subjectStates[subject.id]?.length ?? 0;

            return (
              <article
                key={subject.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70"
              >
                <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSubjectId((current) =>
                        current === subject.id ? null : subject.id,
                      )
                    }
                    className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
                          {subject.label}
                        </h3>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {selectedCount} selected
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {subject.meta}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                      {isOpen ? "Hide" : "Manage"}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={savingId === subject.id}
                      onClick={() => handleSave(subject.id)}
                      type="button"
                    >
                      {savingId === subject.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                {messages[subject.id] ? (
                  <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
                    <p className="text-sm text-slate-600">{messages[subject.id]}</p>
                  </div>
                ) : null}

                {isOpen ? (
                  <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
                    {groupedPermissions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        No permissions matched your search.
                      </div>
                    ) : (
                      <div className="grid gap-4 xl:grid-cols-2">
                        {groupedPermissions.map(([groupName, items]) => {
                          const selected = new Set(subjectStates[subject.id] ?? []);
                          const groupPermissionIds = items.map((permission) => permission.id);
                          const checkedCount = groupPermissionIds.filter((id) =>
                            selected.has(id),
                          ).length;
                          const allChecked =
                            groupPermissionIds.length > 0 &&
                            checkedCount === groupPermissionIds.length;

                          return (
                            <section
                              key={`${subject.id}-${groupName}`}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {groupName}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {checkedCount} of {items.length} selected
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setGroupSelection(
                                      subject.id,
                                      groupPermissionIds,
                                      !allChecked,
                                    )
                                  }
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                                >
                                  {allChecked ? "Clear group" : "Select group"}
                                </button>
                              </div>

                              <div className="mt-3 grid gap-2">
                                {items.map((permission) => {
                                  const isChecked = (
                                    subjectStates[subject.id] ?? []
                                  ).includes(permission.id);

                                  return (
                                    <label
                                      key={`${subject.id}-${permission.id}`}
                                      className={cx(
                                        "flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition",
                                        isChecked
                                          ? "border-slate-300 bg-white"
                                          : "border-slate-200 bg-white/70 hover:border-slate-300",
                                      )}
                                    >
                                      <input
                                        checked={isChecked}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                                        onChange={() =>
                                          togglePermission(subject.id, permission.id)
                                        }
                                        type="checkbox"
                                      />

                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium text-slate-900">
                                          {permission.name}
                                        </span>
                                        <span className="mt-0.5 block break-all text-xs text-slate-500">
                                          {permission.key}
                                        </span>
                                        {permission.description ? (
                                          <span className="mt-1 block text-xs text-slate-500">
                                            {permission.description}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}