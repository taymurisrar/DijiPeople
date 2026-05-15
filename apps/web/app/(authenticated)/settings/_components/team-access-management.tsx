"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  AccessRoleRecord,
  AccessTeamRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../types";
import { ROLE_KEYS } from "@/lib/security-keys";
import { RoleTypeBadge } from "./rbac-components";

type TeamAccessManagementProps = {
  initialTeams: AccessTeamRecord[];
  users: AccessUserRecord[];
  roles: AccessRoleRecord[];
  businessUnits: BusinessUnitRecord[];
};

export function TeamAccessManagement({
  initialTeams,
  users,
  roles,
  businessUnits,
}: TeamAccessManagementProps) {
  const [teams, setTeams] = useState(initialTeams);
  const [selectedTeamId, setSelectedTeamId] = useState(
    initialTeams[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [pendingMemberIds, setPendingMemberIds] = useState<
    Record<string, string[]>
  >({});
  const [pendingRoleIds, setPendingRoleIds] = useState<
    Record<string, string[]>
  >({});
  const [isCreating, setIsCreating] = useState(false);
  const [draftTeam, setDraftTeam] = useState({
    name: "",
    description: "",
    businessUnitId: businessUnits[0]?.id ?? "",
    ownerUserId: users[0]?.userId ?? "",
  });
  const [deactivateTarget, setDeactivateTarget] =
    useState<AccessTeamRecord | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0] ?? null;

  const filteredTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return teams;
    }

    return teams.filter((team) =>
      [
        team.name,
        team.key,
        team.description,
        team.businessUnit?.name,
        team.ownerUser
          ? `${team.ownerUser.firstName} ${team.ownerUser.lastName}`
          : "",
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, teams]);

  function getPendingMemberIds(team: AccessTeamRecord) {
    return (
      pendingMemberIds[team.id] ??
      (team.members ?? []).map((member) => member.userId)
    );
  }

  function getPendingRoleIds(team: AccessTeamRecord) {
    return (
      pendingRoleIds[team.id] ??
      (team.teamRoles ?? []).map((teamRole) => teamRole.role.id)
    );
  }

  function replaceTeams(updatedTeams: AccessTeamRecord[]) {
    setTeams(updatedTeams);
    if (
      updatedTeams.length > 0 &&
      !updatedTeams.some((team) => team.id === selectedTeamId)
    ) {
      setSelectedTeamId(updatedTeams[0]!.id);
    }
  }

  async function createTeam() {
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      if (!draftTeam.name.trim() || !draftTeam.businessUnitId) {
        setError("Team name and business unit are required.");
        return;
      }

      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftTeam),
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessTeamRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        setError(extractMessage(payload) || "Unable to create team.");
        return;
      }

      setTeams((current) => [payload, ...current]);
      setSelectedTeamId(payload.id);
      setIsCreating(false);
      setDraftTeam({
        name: "",
        description: "",
        businessUnitId: businessUnits[0]?.id ?? "",
        ownerUserId: users[0]?.userId ?? "",
      });
      setMessage("Team created.");
    } catch {
      setError("Team creation failed. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMembers(team: AccessTeamRecord) {
    await saveTeamCollection(
      team,
      "members",
      { userIds: getPendingMemberIds(team) },
      "Team members updated.",
    );
  }

  async function saveRoles(team: AccessTeamRecord) {
    await saveTeamCollection(
      team,
      "roles",
      { roleIds: getPendingRoleIds(team) },
      "Team roles updated.",
    );
  }

  async function saveTeamCollection(
    team: AccessTeamRecord,
    collection: "members" | "roles",
    body: Record<string, string[]>,
    successMessage: string,
  ) {
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/teams/${team.id}/${collection}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessTeamRecord[]
        | { message?: string }
        | null;

      if (!response.ok || !Array.isArray(payload)) {
        setError(extractMessage(payload) || "Unable to update team.");
        return;
      }

      replaceTeams(payload);
      setMessage(successMessage);
    } catch {
      setError("Team update failed. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateTeam() {
    if (!deactivateTarget) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/teams/${deactivateTarget.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessTeamRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        setError(extractMessage(payload) || "Unable to deactivate team.");
        return;
      }

      setTeams((current) =>
        current.map((team) => (team.id === payload.id ? payload : team)),
      );
      setMessage("Team deactivated.");
      setDeactivateTarget(null);
    } catch {
      setError("Team deactivation failed. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard
        description="Teams grant role-based access through membership. Effective access includes direct roles and team roles."
        title="Teams"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className="min-h-11 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-md"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team, key, owner, business unit"
            value={query}
          />
          <button
            className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={() => setIsCreating(true)}
            type="button"
          >
            New team
          </button>
        </div>

        {isCreating ? (
          <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-white p-4">
            <input
              className="rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setDraftTeam((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Team name"
              value={draftTeam.name}
            />
            <textarea
              className="min-h-24 rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setDraftTeam((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Description"
              value={draftTeam.description}
            />
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setDraftTeam((current) => ({
                  ...current,
                  businessUnitId: event.target.value,
                }))
              }
              value={draftTeam.businessUnitId}
            >
              <option value="">Select business unit</option>
              {businessUnits.map((businessUnit) => (
                <option key={businessUnit.id} value={businessUnit.id}>
                  {businessUnit.name}
                  {businessUnit.organization?.name
                    ? ` (${businessUnit.organization.name})`
                    : ""}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setDraftTeam((current) => ({
                  ...current,
                  ownerUserId: event.target.value,
                }))
              }
              value={draftTeam.ownerUserId}
            >
              <option value="">No owner</option>
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.firstName} {user.lastName} ({user.email})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground"
                onClick={() => setIsCreating(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
                onClick={createTeam}
                type="button"
              >
                Create team
              </button>
            </div>
          </div>
        ) : null}

        {filteredTeams.length === 0 ? (
          <EmptyState
            description="Create an access team or adjust your search."
            title="No teams found"
          />
        ) : (
          <div className="grid gap-3">
            {filteredTeams.map((team) => (
              <button
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selectedTeam?.id === team.id
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-white hover:border-accent/40"
                }`}
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {team.name}
                      </p>
                      <StatusPill tone={team.isActive ? "good" : "muted"}>
                        {team.isActive ? "Active" : "Inactive"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {team.description || team.key}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>{team.businessUnit?.name ?? "No business unit"}</p>
                    <p>
                      {(team.members ?? []).length} members /{" "}
                      {(team.teamRoles ?? []).length} roles
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedTeam ? (
        <div className="grid gap-6">
          <SectionCard
            description="Team ownership and hierarchy placement. Membership and role changes are tenant-safe on the backend."
            title="Team Detail"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-semibold text-foreground">
                    {selectedTeam.name}
                  </h3>
                  <StatusPill tone={selectedTeam.isActive ? "good" : "muted"}>
                    {selectedTeam.isActive ? "Active" : "Inactive"}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {selectedTeam.description || "No description has been added."}
                </p>
                <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">
                  <p>Key: {selectedTeam.key}</p>
                  <p>Type: {startCase(selectedTeam.teamType)}</p>
                  <p>
                    Business unit:{" "}
                    {selectedTeam.businessUnit?.name ?? "Not set"}
                  </p>
                  <p>
                    Owner:{" "}
                    {selectedTeam.ownerUser
                      ? `${selectedTeam.ownerUser.firstName} ${selectedTeam.ownerUser.lastName}`
                      : "No owner"}
                  </p>
                </div>
              </div>
              <button
                className="rounded-2xl border border-danger/20 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-60"
                disabled={selectedTeam.isSystem || !selectedTeam.isActive}
                onClick={() => setDeactivateTarget(selectedTeam)}
                type="button"
              >
                Deactivate
              </button>
            </div>
          </SectionCard>

          <SectionCard
            description="Members inherit this team's assigned roles. Users must belong to this tenant."
            title="Members"
          >
            <TeamPickerGrid
              emptyLabel="No users match your search."
              items={users
                .filter((user) =>
                  `${user.firstName} ${user.lastName} ${user.email}`
                    .toLowerCase()
                    .includes(memberQuery.toLowerCase()),
                )
                .map((user) => ({
                  id: user.userId,
                  title: `${user.firstName} ${user.lastName}`,
                  description: user.email,
                }))}
              query={memberQuery}
              selectedIds={getPendingMemberIds(selectedTeam)}
              searchPlaceholder="Search users"
              onQueryChange={setMemberQuery}
              onToggle={(userId) =>
                setPendingMemberIds((current) => ({
                  ...current,
                  [selectedTeam.id]: toggleId(
                    getPendingMemberIds(selectedTeam),
                    userId,
                  ),
                }))
              }
            />
            <ActionRow
              disabled={
                isSaving || selectedTeam.isSystem || !selectedTeam.isActive
              }
              label="Save members"
              onClick={() => saveMembers(selectedTeam)}
            />
          </SectionCard>

          <SectionCard
            description="Assign tenant roles to the team. Global Administrator is blocked by backend protections."
            title="Assigned Roles"
          >
            <div className="mb-3">
              <input
                className="min-h-11 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-md"
                onChange={(event) => setRoleQuery(event.target.value)}
                placeholder="Search roles"
                value={roleQuery}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {roles
                .filter((role) =>
                  `${role.name} ${role.key} ${role.description ?? ""}`
                    .toLowerCase()
                    .includes(roleQuery.toLowerCase()),
                )
                .map((role) => {
                  const selected = getPendingRoleIds(selectedTeam).includes(
                    role.id,
                  );
                  return (
                    <label
                      className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${
                        selected
                          ? "border-accent bg-accent-soft/40"
                          : "border-border bg-white"
                      }`}
                      key={role.id}
                    >
                      <input
                        checked={selected}
                        disabled={role.key === ROLE_KEYS.GLOBAL_ADMIN}
                        onChange={() =>
                          setPendingRoleIds((current) => ({
                            ...current,
                            [selectedTeam.id]: toggleId(
                              getPendingRoleIds(selectedTeam),
                              role.id,
                            ),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          {role.name}
                          <RoleTypeBadge role={role} />
                        </span>
                        <span className="mt-1 block text-muted">
                          {role.description || startCase(role.key)}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
            <ActionRow
              disabled={
                isSaving || selectedTeam.isSystem || !selectedTeam.isActive
              }
              label="Save roles"
              onClick={() => saveRoles(selectedTeam)}
            />
          </SectionCard>

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
        </div>
      ) : (
        <EmptyState
          description="Create a team or adjust your filters."
          title="No team selected"
        />
      )}

      <ConfirmDialog
        confirmAction={{
          label: "Deactivate team",
          onClick: deactivateTeam,
          variant: "danger",
        }}
        description="Members will stop receiving access from this team because inactive team roles are ignored by effective access."
        isLoading={isSaving}
        onClose={() => setDeactivateTarget(null)}
        open={Boolean(deactivateTarget)}
        title="Deactivate this team?"
      />
    </div>
  );
}

function TeamPickerGrid({
  emptyLabel,
  items,
  query,
  searchPlaceholder,
  selectedIds,
  onQueryChange,
  onToggle,
}: {
  emptyLabel: string;
  items: Array<{ id: string; title: string; description: string }>;
  query: string;
  searchPlaceholder: string;
  selectedIds: string[];
  onQueryChange: (value: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <input
        className="mb-3 min-h-11 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-md"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={searchPlaceholder}
        value={query}
      />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <label
                className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${
                  selected
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-white"
                }`}
                key={item.id}
              >
                <input
                  checked={selected}
                  onChange={() => onToggle(item.id)}
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-muted">
                    {item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}

function ActionRow({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}

function toggleId(values: string[], id: string) {
  return values.includes(id)
    ? values.filter((value) => value !== id)
    : [...values, id];
}

function extractMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    return typeof message === "string" ? message : "Request failed.";
  }

  return "Request failed.";
}

function startCase(value: string) {
  return value
    .toLowerCase()
    .split(/[-_ .]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
