"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount/filter sets state after awaits; the load is intended */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { PanelDialog } from "../tenants/tenant-panel-ui";

/**
 * Platform teams: the groups support cases and assignment rules route work to.
 *
 * Archiving is the normal way to retire a team. The API refuses it while open
 * cases or active rules still point at the team, and answers with the counts;
 * this screen then asks where that work should go instead of failing the
 * operator with a bare error. Deleting is only possible for a team nothing has
 * ever referenced, and the API says so when it is not.
 */

type Category = "SUPPORT" | "SALES" | "BILLING" | "OPERATIONS" | "GENERAL";
const CATEGORIES: Category[] = [
  "SUPPORT",
  "SALES",
  "BILLING",
  "OPERATIONS",
  "GENERAL",
];

type Team = {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  isActive: boolean;
  email: string | null;
  sortOrder: number;
  archivedAt: string | null;
  leadUser: { id: string; fullName: string; email: string } | null;
  memberCount: number;
  openCaseCount: number;
};

type Member = {
  id: string;
  platformUserId: string;
  fullName: string;
  email: string;
  status: string;
  role: "MEMBER" | "LEAD";
  receivesAssignments: boolean;
};

type TeamDetail = Team & { members: Member[] };
type UserOption = { id: string; name: string };
type ApiError = {
  message?: string;
  errorCode?: string;
  details?: {
    openCaseCount?: number;
    activeRuleCount?: number;
    caseCount?: number;
    ruleCount?: number;
  };
};
type StatusFilter = "active" | "archived" | "all";

const ENDPOINT = "/api/platform-teams";

const control =
  "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900";
const primaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";
const quietButton =
  "rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40";

async function readError(response: Response): Promise<ApiError> {
  return ((await response.json().catch(() => null)) as ApiError | null) ?? {};
}

/*
 * The shared admin dialog: focus trap, Escape, focus return and the overlay
 * layer the stacking-order spec (lib/z-layers.spec.ts) reserves for it. A
 * local modal here would claim a z-index page content may not hold.
 */
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <PanelDialog onClose={onClose} title={title} wide>
      <div className="space-y-4">{children}</div>
    </PanelDialog>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
      role="alert"
    >
      {message}
    </p>
  );
}

export function PlatformTeamsManager({ users }: { users: UserOption[] }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [category, setCategory] = useState<Category | "">("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState<Team | "new" | null>(null);
  const [archiving, setArchiving] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [managing, setManaging] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ pageSize: "200" });
    if (status !== "all") query.set("active", String(status === "active"));
    if (category) query.set("category", category);
    if (search.trim()) query.set("search", search.trim());
    const response = await fetch(`${ENDPOINT}?${query}`, { cache: "no-store" });
    if (response.status === 403) {
      setDenied(true);
      return;
    }
    if (!response.ok) {
      setError("Teams could not be read. Reload the page to try again.");
      setTeams([]);
      return;
    }
    const payload = (await response.json()) as { items: Team[] };
    setError(null);
    setTeams(payload.items);
  }, [status, category, search]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per key.
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const restore = useCallback(
    async (team: Team) => {
      setBusyId(team.id);
      setError(null);
      const response = await fetch(`${ENDPOINT}/${team.id}/restore`, {
        method: "POST",
      });
      setBusyId(null);
      if (!response.ok) {
        setError(
          (await readError(response)).message ??
            "The team could not be restored.",
        );
        return;
      }
      await load();
    },
    [load],
  );

  if (denied)
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        You need the <code>support.read</code> permission to view teams.
      </p>
    );

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Search
          <input
            className={`${control} w-56`}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Status
          <select
            className={control}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Category
          <select
            className={control}
            onChange={(event) => setCategory(event.target.value as Category | "")}
            value={category}
          >
            <option value="">All</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item.charAt(0) + item.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`${primaryButton} ml-auto`}
          onClick={() => setForm("new")}
          type="button"
        >
          <Plus aria-hidden className="h-4 w-4" />
          New team
        </button>
      </div>

      <ErrorLine message={error} />

      {teams === null ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-slate-500">
          <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          Loading teams…
        </p>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No teams match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Platform teams</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {["Team", "Category", "Lead", "Members", "Open cases", "Status", "Actions"].map(
                  (heading) => (
                    <th className="px-3 py-2 font-medium" key={heading} scope="col">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr className="border-t border-slate-100" key={team.id}>
                  <th
                    className="px-3 py-3 text-left font-semibold text-slate-900"
                    scope="row"
                  >
                    {team.name}
                    {team.email ? (
                      <span className="block text-xs font-normal text-slate-500">
                        {team.email}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-3 py-3 text-slate-700">
                    {team.category.charAt(0) + team.category.slice(1).toLowerCase()}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {team.leadUser?.fullName ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{team.memberCount}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {team.openCaseCount}
                  </td>
                  <td className="px-3 py-3">
                    {/* The badge carries text, not colour alone. */}
                    {team.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={quietButton}
                        onClick={() => setManaging(team.id)}
                        type="button"
                      >
                        Members
                      </button>
                      <button
                        className={quietButton}
                        onClick={() => setForm(team)}
                        type="button"
                      >
                        Edit
                      </button>
                      {team.isActive ? (
                        <button
                          className={quietButton}
                          onClick={() => setArchiving(team)}
                          type="button"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          className={quietButton}
                          disabled={busyId === team.id}
                          onClick={() => restore(team)}
                          type="button"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        className={quietButton}
                        onClick={() => setDeleting(team)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <TeamFormDialog
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await load();
          }}
          team={form === "new" ? null : form}
          users={users}
        />
      ) : null}
      {archiving ? (
        <ArchiveDialog
          onClose={() => setArchiving(null)}
          onDone={async () => {
            setArchiving(null);
            await load();
          }}
          team={archiving}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          onClose={() => setDeleting(null)}
          onDone={async () => {
            setDeleting(null);
            await load();
          }}
          team={deleting}
        />
      ) : null}
      {managing ? (
        <MembersDialog
          onClose={() => {
            setManaging(null);
            void load();
          }}
          teamId={managing}
          users={users}
        />
      ) : null}
    </section>
  );
}

function TeamFormDialog({
  team,
  users,
  onClose,
  onSaved,
}: {
  team: Team | null;
  users: UserOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [category, setCategory] = useState<Category>(team?.category ?? "GENERAL");
  const [email, setEmail] = useState(team?.email ?? "");
  const [leadUserId, setLeadUserId] = useState(team?.leadUser?.id ?? "");
  const [sortOrder, setSortOrder] = useState(String(team?.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("A team name needs at least 2 characters.");
      return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0) {
      setError("Sort order must be a whole number, 0 or more.");
      return;
    }
    setSaving(true);
    setError(null);
    /*
     * Empty optionals are omitted on create (the API rejects "" for email) and
     * sent only when they changed on edit, so saving never rewrites a field the
     * operator did not touch.
     */
    const body: Record<string, unknown> = {
      name: name.trim(),
      category,
      sortOrder: order,
    };
    if (description.trim() || team?.description) body.description = description.trim();
    if (email.trim()) body.email = email.trim();
    if (leadUserId && leadUserId !== team?.leadUser?.id) body.leadUserId = leadUserId;
    const response = await fetch(team ? `${ENDPOINT}/${team.id}` : ENDPOINT, {
      method: team ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      setError((await readError(response)).message ?? "The team could not be saved.");
      return;
    }
    await onSaved();
  };

  return (
    <Dialog onClose={onClose} title={team ? `Edit ${team.name}` : "New team"}>
      <form className="grid gap-3" onSubmit={save}>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Name
          <input
            className={control}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Description
          <textarea
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Category
            <select
              className={control}
              onChange={(event) => setCategory(event.target.value as Category)}
              value={category}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0) + item.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Team email
            <input
              className={control}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Lead
            <select
              className={control}
              onChange={(event) => setLeadUserId(event.target.value)}
              value={leadUserId}
            >
              <option value="">No lead</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Sort order
            <input
              className={control}
              inputMode="numeric"
              onChange={(event) => setSortOrder(event.target.value)}
              value={sortOrder}
            />
          </label>
        </div>
        <ErrorLine message={error} />
        <div className="flex justify-end gap-2">
          <button className={quietButton} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={primaryButton} disabled={saving} type="submit">
            {saving ? "Saving…" : "Save team"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ArchiveDialog({
  team,
  onClose,
  onDone,
}: {
  team: Team;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [inUse, setInUse] = useState<{ cases: number; rules: number } | null>(
    null,
  );
  const [targets, setTargets] = useState<Team[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (reassignToTeamId?: string) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`${ENDPOINT}/${team.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reassignToTeamId ? { reassignToTeamId } : {}),
    });
    setBusy(false);
    if (response.ok) {
      await onDone();
      return;
    }
    const payload = await readError(response);
    if (response.status === 409 && payload.details?.openCaseCount !== undefined) {
      // In use: show the counts and ask where the work should go.
      setInUse({
        cases: payload.details.openCaseCount ?? 0,
        rules: payload.details.activeRuleCount ?? 0,
      });
      const list = await fetch(`${ENDPOINT}?active=true&pageSize=200`, {
        cache: "no-store",
      });
      if (list.ok) {
        const data = (await list.json()) as { items: Team[] };
        setTargets(data.items.filter((item) => item.id !== team.id));
      }
      return;
    }
    setError(payload.message ?? "The team could not be archived.");
  };

  return (
    <Dialog onClose={onClose} title={`Archive ${team.name}`}>
      {inUse ? (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            {inUse.cases} open support case{inUse.cases === 1 ? "" : "s"} and{" "}
            {inUse.rules} active assignment rule{inUse.rules === 1 ? "" : "s"}{" "}
            still use this team. Choose the team they move to.
          </p>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Move work to
            <select
              className={control}
              onChange={(event) => setTarget(event.target.value)}
              value={target}
            >
              <option value="">Select a team</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-sm text-slate-700">
          The team is hidden from pickers. Restore it from the archived list at
          any time.
        </p>
      )}
      <ErrorLine message={error} />
      <div className="flex justify-end gap-2">
        <button className={quietButton} onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className={primaryButton}
          disabled={busy || (inUse !== null && !target)}
          onClick={() => submit(inUse ? target : undefined)}
          type="button"
        >
          {busy ? "Archiving…" : inUse ? "Move work and archive" : "Archive team"}
        </button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({
  team,
  onClose,
  onDone,
}: {
  team: Team;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`${ENDPOINT}/${team.id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      // The API explains when a team is referenced and should be archived.
      setError(
        (await readError(response)).message ?? "The team could not be deleted.",
      );
      return;
    }
    await onDone();
  };

  return (
    <Dialog onClose={onClose} title={`Delete ${team.name}`}>
      <p className="text-sm text-slate-700">
        Deleting removes the team and its memberships permanently.
      </p>
      <ErrorLine message={error} />
      <div className="flex justify-end gap-2">
        <button className={quietButton} onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="inline-flex h-10 items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
          disabled={busy}
          onClick={remove}
          type="button"
        >
          {busy ? "Deleting…" : "Delete team"}
        </button>
      </div>
    </Dialog>
  );
}

function MembersDialog({
  teamId,
  users,
  onClose,
}: {
  teamId: string;
  users: UserOption[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`${ENDPOINT}/${teamId}`, { cache: "no-store" });
    if (!response.ok) {
      setError((await readError(response)).message ?? "Members could not be read.");
      return;
    }
    setDetail((await response.json()) as TeamDetail);
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (
    path: string,
    method: string,
    body: unknown,
    failure: string,
  ) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`${ENDPOINT}/${teamId}/members${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    setBusy(false);
    if (!response.ok) {
      setError((await readError(response)).message ?? failure);
      return;
    }
    await load();
  };

  const available = useMemo(() => {
    const taken = new Set(detail?.members.map((m) => m.platformUserId));
    return users.filter((user) => !taken.has(user.id));
  }, [detail, users]);

  return (
    <Dialog onClose={onClose} title={detail ? `${detail.name} members` : "Members"}>
      <ErrorLine message={error} />
      {detail === null ? (
        error ? null : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
            Loading members…
          </p>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Add a person
              <select
                className={`${control} w-64`}
                onChange={(event) => setPick(event.target.value)}
                value={pick}
              >
                <option value="">Select a person</option>
                {available.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={primaryButton}
              disabled={!pick || busy}
              onClick={async () => {
                await call("", "POST", { platformUserId: pick }, "The person could not be added.");
                setPick("");
              }}
              type="button"
            >
              Add
            </button>
          </div>

          {detail.members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
              No one is on this team yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Team members</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    {["Person", "Lead", "Receives assignments", "Actions"].map((h) => (
                      <th className="px-3 py-2 font-medium" key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((member) => (
                    <tr className="border-t border-slate-100" key={member.id}>
                      <th
                        className="px-3 py-3 text-left font-semibold text-slate-900"
                        scope="row"
                      >
                        {member.fullName}
                        <span className="block text-xs font-normal text-slate-500">
                          {member.email}
                          {member.status !== "ACTIVE" ? ` · ${member.status}` : ""}
                        </span>
                      </th>
                      <td className="px-3 py-3">
                        <input
                          aria-label={`${member.fullName} is the team lead`}
                          checked={member.role === "LEAD"}
                          disabled={busy}
                          onChange={(event) =>
                            call(
                              `/${member.id}`,
                              "PATCH",
                              { role: event.target.checked ? "LEAD" : "MEMBER" },
                              "The lead could not be changed.",
                            )
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          aria-label={`${member.fullName} receives assignments`}
                          checked={member.receivesAssignments}
                          disabled={busy}
                          onChange={(event) =>
                            call(
                              `/${member.id}`,
                              "PATCH",
                              { receivesAssignments: event.target.checked },
                              "The setting could not be changed.",
                            )
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          className={quietButton}
                          disabled={busy}
                          onClick={() =>
                            call(`/${member.id}`, "DELETE", undefined, "The person could not be removed.")
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="flex justify-end">
        <button className={quietButton} onClick={onClose} type="button">
          Close
        </button>
      </div>
    </Dialog>
  );
}
