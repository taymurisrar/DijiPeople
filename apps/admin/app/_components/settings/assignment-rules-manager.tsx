"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus } from "lucide-react";

/**
 * Who owns a new lead, customer or support case.
 *
 * A rule is created switched off. An administrator reads what it would do in
 * the dry-run panel, then enables it. Rules only ever apply to records created
 * after they are enabled; existing records are never re-assigned, and an owner
 * somebody chose by hand is never replaced.
 */

type ModuleKey = "leads" | "customers" | "support-cases";
type Strategy = "SPECIFIC_USER" | "TEAM_ROUND_ROBIN" | "USER_ROUND_ROBIN";

type Rule = {
  id: string;
  moduleKey: ModuleKey;
  name: string;
  description: string | null;
  isActive: boolean;
  priority: number;
  conditions: Record<string, string | number | boolean>;
  strategy: Strategy;
  targetUserId: string | null;
  targetTeamId: string | null;
  candidateUserIds: string[];
  matchCount: number;
  lastAssignedAt: string | null;
  lastAssignedUserId: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  targetUser: { id: string; fullName: string } | null;
  targetTeam: { id: string; name: string } | null;
};

type Option = { id: string; name: string };

type Draft = {
  id: string | null;
  moduleKey: ModuleKey;
  name: string;
  description: string;
  priority: string;
  strategy: Strategy;
  targetUserId: string;
  targetTeamId: string;
  candidateUserIds: string[];
  conditions: { field: string; value: string }[];
};

const ENDPOINT = "/api/super-admin/assignment-rules";

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "customers", label: "Customers" },
  { key: "support-cases", label: "Support cases" },
];

/* Mirrors ASSIGNMENT_CONDITION_FIELDS in the API; the API is the authority. */
const CONDITION_FIELDS: Record<ModuleKey, string[]> = {
  leads: ["source", "country", "status", "partnerId", "industry"],
  customers: [
    "originChannel",
    "country",
    "status",
    "selectedPlanId",
    "originatingPartnerId",
    "industry",
  ],
  "support-cases": [
    "category",
    "severity",
    "priority",
    "channel",
    "customerAccountId",
    "partnerId",
  ],
};

const STRATEGY_LABEL: Record<Strategy, string> = {
  SPECIFIC_USER: "Specific person",
  TEAM_ROUND_ROBIN: "Team, in turn",
  USER_ROUND_ROBIN: "People, in turn",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900";
const buttonClass =
  "rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

function emptyDraft(moduleKey: ModuleKey): Draft {
  return {
    id: null,
    moduleKey,
    name: "",
    description: "",
    priority: "100",
    strategy: "SPECIFIC_USER",
    targetUserId: "",
    targetTeamId: "",
    candidateUserIds: [],
    conditions: [],
  };
}

function draftFromRule(rule: Rule): Draft {
  return {
    id: rule.id,
    moduleKey: rule.moduleKey,
    name: rule.name,
    description: rule.description ?? "",
    priority: String(rule.priority),
    strategy: rule.strategy,
    targetUserId: rule.targetUserId ?? "",
    targetTeamId: rule.targetTeamId ?? "",
    candidateUserIds: rule.candidateUserIds,
    conditions: Object.entries(rule.conditions).map(([field, value]) => ({
      field,
      value: String(value),
    })),
  };
}

function conditionsFrom(rows: { field: string; value: string }[]) {
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.field && row.value.trim()) result[row.field] = row.value.trim();
  }
  return result;
}

async function readMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = payload?.message;
  return (Array.isArray(message) ? message.join(" ") : message) ?? fallback;
}

export function AssignmentRulesManager({
  users,
  teams,
}: {
  users: Option[];
  teams: Option[];
}) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<ModuleKey | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const response = await fetch(ENDPOINT, { cache: "no-store" }).catch(
      () => null,
    );
    if (!response) {
      setLoadFailed(true);
      return;
    }
    if (response.status === 403) {
      setDenied(true);
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      items?: Rule[];
    } | null;
    if (!response.ok || !payload?.items) {
      setLoadFailed(true);
      return;
    }
    setRules(payload.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (rules ?? [])
        .filter((rule) => tab === "all" || rule.moduleKey === tab)
        .sort(
          (a, b) =>
            a.moduleKey.localeCompare(b.moduleKey) || b.priority - a.priority,
        ),
    [rules, tab],
  );

  const userName = useCallback(
    (id: string | null) => users.find((user) => user.id === id)?.name ?? id,
    [users],
  );

  const run = useCallback(
    async (
      id: string,
      request: () => Promise<Response>,
      failure: string,
    ): Promise<boolean> => {
      setBusyId(id);
      setError(null);
      const response = await request().catch(() => null);
      setBusyId(null);
      if (!response || !response.ok) {
        setError(
          response ? await readMessage(response, failure) : failure,
        );
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const toggle = (rule: Rule) =>
    run(
      rule.id,
      () =>
        fetch(`${ENDPOINT}/${rule.id}/${rule.isActive ? "disable" : "enable"}`, {
          method: "POST",
        }),
      "The rule could not be changed.",
    );

  /*
   * Moving a rule swaps priorities with its neighbour in the same module, so
   * the order the screen shows is the order the API evaluates. When the two
   * are tied the one being raised is bumped above instead.
   */
  const move = async (rule: Rule, direction: -1 | 1) => {
    const siblings = (rules ?? [])
      .filter((item) => item.moduleKey === rule.moduleKey)
      .sort((a, b) => b.priority - a.priority);
    const index = siblings.findIndex((item) => item.id === rule.id);
    const neighbour = siblings[index + direction];
    if (!neighbour) return;
    if (neighbour.priority === rule.priority) {
      await run(
        rule.id,
        () =>
          fetch(`${ENDPOINT}/${rule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              priority: rule.priority + (direction === -1 ? 1 : -1),
            }),
          }),
        "The order could not be changed.",
      );
      return;
    }
    const ok = await run(
      rule.id,
      () =>
        fetch(`${ENDPOINT}/${rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: neighbour.priority }),
        }),
      "The order could not be changed.",
    );
    if (ok) {
      await run(
        neighbour.id,
        () =>
          fetch(`${ENDPOINT}/${neighbour.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: rule.priority }),
          }),
        "The order could not be changed.",
      );
    }
  };

  const remove = async (rule: Rule) => {
    const ok = await run(
      rule.id,
      () => fetch(`${ENDPOINT}/${rule.id}`, { method: "DELETE" }),
      "The rule could not be deleted.",
    );
    if (ok) setConfirmDelete(null);
  };

  const save = async () => {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      setError("Give the rule a name of at least two characters.");
      return;
    }
    const priority = Number(draft.priority);
    if (!Number.isInteger(priority) || priority < 0) {
      setError("Priority must be a whole number, zero or higher.");
      return;
    }
    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      priority,
      conditions: conditionsFrom(draft.conditions),
      strategy: draft.strategy,
      ...(draft.strategy === "SPECIFIC_USER" && draft.targetUserId
        ? { targetUserId: draft.targetUserId }
        : {}),
      ...(draft.strategy === "TEAM_ROUND_ROBIN" && draft.targetTeamId
        ? { targetTeamId: draft.targetTeamId }
        : {}),
      ...(draft.strategy === "USER_ROUND_ROBIN"
        ? { candidateUserIds: draft.candidateUserIds }
        : {}),
    };
    if (!draft.id) body.moduleKey = draft.moduleKey;
    setSaving(true);
    setError(null);
    const response = await fetch(
      draft.id ? `${ENDPOINT}/${draft.id}` : ENDPOINT,
      {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch(() => null);
    setSaving(false);
    if (!response || !response.ok) {
      setError(
        response
          ? await readMessage(response, "The rule could not be saved.")
          : "The rule could not be saved.",
      );
      return;
    }
    setDraft(null);
    await load();
  };

  if (denied)
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        You need the <code>settings.read</code> permission to view assignment
        rules.
      </p>
    );

  if (loadFailed)
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
        role="alert"
      >
        Assignment rules could not be loaded.{" "}
        <button
          className="font-semibold underline"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      </div>
    );

  if (rules === null)
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500 shadow-sm">
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
        Loading assignment rules…
      </p>
    );

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            aria-label="Filter by module"
            className="flex flex-wrap gap-1"
            role="tablist"
          >
            {[{ key: "all" as const, label: "All" }, ...MODULES].map((item) => (
              <button
                aria-selected={tab === item.key}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  tab === item.key
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                key={item.key}
                onClick={() => setTab(item.key)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
            onClick={() => {
              setError(null);
              setDraft(emptyDraft(tab === "all" ? "leads" : tab));
            }}
            type="button"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New rule
          </button>
        </div>

        {error ? (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            No assignment rules yet. New records stay unassigned until someone
            picks an owner.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">Assignment rules</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  {[
                    "Rule",
                    "Priority",
                    "Strategy",
                    "Target",
                    "Status",
                    "Matches",
                    "Last assigned",
                    "Actions",
                  ].map((heading) => (
                    <th className="px-3 py-2 font-medium" key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((rule) => {
                  const busy = busyId === rule.id;
                  return (
                    <tr
                      className="border-t border-slate-100 align-top"
                      key={rule.id}
                    >
                      <th
                        className="px-3 py-3 text-left font-semibold text-slate-900"
                        scope="row"
                      >
                        {rule.name}
                        <span className="block text-xs font-normal text-slate-500">
                          {MODULES.find((m) => m.key === rule.moduleKey)?.label}
                          {Object.keys(rule.conditions).length
                            ? ` · ${Object.entries(rule.conditions)
                                .map(([k, v]) => `${k} = ${String(v)}`)
                                .join(", ")}`
                            : " · every record"}
                        </span>
                        {rule.lastFailureReason ? (
                          <span className="mt-1 block text-xs font-normal text-rose-700">
                            Last problem
                            {rule.lastFailureAt
                              ? ` (${new Date(rule.lastFailureAt).toLocaleString()})`
                              : ""}
                            : {rule.lastFailureReason}
                          </span>
                        ) : null}
                      </th>
                      <td className="px-3 py-3 text-slate-700">{rule.priority}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {STRATEGY_LABEL[rule.strategy]}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {rule.strategy === "SPECIFIC_USER"
                          ? (rule.targetUser?.fullName ?? "—")
                          : rule.strategy === "TEAM_ROUND_ROBIN"
                            ? (rule.targetTeam?.name ?? "—")
                            : `${rule.candidateUserIds.length} people`}
                      </td>
                      <td className="px-3 py-3">
                        {/* The badge carries text, not colour alone. */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            rule.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {rule.isActive ? "On" : "Off"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {rule.matchCount}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {rule.lastAssignedAt
                          ? `${new Date(rule.lastAssignedAt).toLocaleString()}${
                              rule.lastAssignedUserId
                                ? ` · ${userName(rule.lastAssignedUserId)}`
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            aria-label={`Raise priority of ${rule.name}`}
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => void move(rule, -1)}
                            type="button"
                          >
                            <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`Lower priority of ${rule.name}`}
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => void move(rule, 1)}
                            type="button"
                          >
                            <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => void toggle(rule)}
                            type="button"
                          >
                            {rule.isActive ? "Turn off" : "Turn on"}
                          </button>
                          <button
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => {
                              setError(null);
                              setDraft(draftFromRule(rule));
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          {confirmDelete === rule.id ? (
                            <>
                              <button
                                className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                                disabled={busy}
                                onClick={() => void remove(rule)}
                                type="button"
                              >
                                Confirm delete
                              </button>
                              <button
                                className={buttonClass}
                                onClick={() => setConfirmDelete(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className={buttonClass}
                              disabled={busy}
                              onClick={() => setConfirmDelete(rule.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft ? (
        <RuleForm
          draft={draft}
          onCancel={() => setDraft(null)}
          onChange={setDraft}
          onSave={() => void save()}
          saving={saving}
          teams={teams}
          users={users}
        />
      ) : null}

      <TestPanel />
    </div>
  );
}

function RuleForm({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  users,
  teams,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  users: Option[];
  teams: Option[];
}) {
  const fields = CONDITION_FIELDS[draft.moduleKey];
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <section
      aria-label={draft.id ? "Edit rule" : "New rule"}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {draft.id ? "Edit rule" : "New rule"}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Module
          <select
            className={inputClass}
            disabled={draft.id !== null}
            onChange={(event) =>
              set({ moduleKey: event.target.value as ModuleKey, conditions: [] })
            }
            value={draft.moduleKey}
          >
            {MODULES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Name
          <input
            className={inputClass}
            maxLength={120}
            onChange={(event) => set({ name: event.target.value })}
            value={draft.name}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Description
          <input
            className={inputClass}
            maxLength={500}
            onChange={(event) => set({ description: event.target.value })}
            value={draft.description}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Priority (higher runs first)
          <input
            className={inputClass}
            inputMode="numeric"
            onChange={(event) => set({ priority: event.target.value })}
            value={draft.priority}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Strategy
          <select
            className={inputClass}
            onChange={(event) => set({ strategy: event.target.value as Strategy })}
            value={draft.strategy}
          >
            {(Object.keys(STRATEGY_LABEL) as Strategy[]).map((key) => (
              <option key={key} value={key}>
                {STRATEGY_LABEL[key]}
              </option>
            ))}
          </select>
        </label>

        {draft.strategy === "SPECIFIC_USER" ? (
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            Owner
            <select
              className={inputClass}
              onChange={(event) => set({ targetUserId: event.target.value })}
              value={draft.targetUserId}
            >
              <option value="">Choose a person</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {draft.strategy === "TEAM_ROUND_ROBIN" ? (
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            Team
            <select
              className={inputClass}
              onChange={(event) => set({ targetTeamId: event.target.value })}
              value={draft.targetTeamId}
            >
              <option value="">Choose a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {draft.strategy === "USER_ROUND_ROBIN" ? (
          <fieldset className="grid gap-2 md:col-span-2">
            <legend className="text-sm font-medium text-slate-700">
              People in the rotation
            </legend>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {users.map((user) => (
                <label
                  className="flex items-center gap-2 text-sm text-slate-700"
                  key={user.id}
                >
                  <input
                    checked={draft.candidateUserIds.includes(user.id)}
                    onChange={(event) =>
                      set({
                        candidateUserIds: event.target.checked
                          ? [...draft.candidateUserIds, user.id]
                          : draft.candidateUserIds.filter((id) => id !== user.id),
                      })
                    }
                    type="checkbox"
                  />
                  {user.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="grid gap-2 md:col-span-2">
          <legend className="text-sm font-medium text-slate-700">
            Only when (leave empty to match every record)
          </legend>
          {draft.conditions.map((row, index) => (
            <div className="flex flex-wrap items-center gap-2" key={index}>
              <select
                aria-label="Field"
                className={`${inputClass} sm:w-56`}
                onChange={(event) =>
                  set({
                    conditions: draft.conditions.map((item, i) =>
                      i === index ? { ...item, field: event.target.value } : item,
                    ),
                  })
                }
                value={row.field}
              >
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-500">equals</span>
              <input
                aria-label="Value"
                className={`${inputClass} sm:w-64`}
                onChange={(event) =>
                  set({
                    conditions: draft.conditions.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  })
                }
                value={row.value}
              />
              <button
                className={buttonClass}
                onClick={() =>
                  set({
                    conditions: draft.conditions.filter((_, i) => i !== index),
                  })
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className={buttonClass}
              onClick={() =>
                set({
                  conditions: [
                    ...draft.conditions,
                    { field: fields[0] ?? "", value: "" },
                  ],
                })
              }
              type="button"
            >
              Add condition
            </button>
          </div>
        </fieldset>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          disabled={saving}
          onClick={onSave}
          type="button"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
        <button
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

type TestResult = {
  matched: boolean;
  rule?: { id: string; name: string; strategy: Strategy } | null;
  user?: { fullName: string; email: string } | null;
  teamId?: string | null;
};

/*
 * Dry run. The API evaluates the live rules against the sample record and says
 * who would be picked, without advancing any rotation, so it is safe to run as
 * often as needed.
 */
function TestPanel() {
  const [moduleKey, setModuleKey] = useState<ModuleKey>("leads");
  const [rows, setRows] = useState<{ field: string; value: string }[]>([]);
  const [result, setResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const fields = CONDITION_FIELDS[moduleKey];

  const run = async () => {
    setRunning(true);
    setMessage(null);
    setResult(null);
    const response = await fetch(`${ENDPOINT}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleKey, record: conditionsFrom(rows) }),
    }).catch(() => null);
    setRunning(false);
    if (!response || !response.ok) {
      setMessage(
        response
          ? await readMessage(response, "The test could not be run.")
          : "The test could not be run.",
      );
      return;
    }
    setResult((await response.json()) as TestResult);
  };

  return (
    <section
      aria-label="Test rules"
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-950">Test the rules</h2>
      <p className="text-sm text-slate-600">
        Describe a new record and see which rule would pick its owner. Nothing
        is assigned and no rotation moves.
      </p>
      <label className="grid max-w-xs gap-1 text-sm font-medium text-slate-700">
        Module
        <select
          className={inputClass}
          onChange={(event) => {
            setModuleKey(event.target.value as ModuleKey);
            setRows([]);
            setResult(null);
          }}
          value={moduleKey}
        >
          {MODULES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {rows.map((row, index) => (
        <div className="flex flex-wrap items-center gap-2" key={index}>
          <select
            aria-label="Record field"
            className={`${inputClass} sm:w-56`}
            onChange={(event) =>
              setRows(
                rows.map((item, i) =>
                  i === index ? { ...item, field: event.target.value } : item,
                ),
              )
            }
            value={row.field}
          >
            {fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
          <input
            aria-label="Record value"
            className={`${inputClass} sm:w-64`}
            onChange={(event) =>
              setRows(
                rows.map((item, i) =>
                  i === index ? { ...item, value: event.target.value } : item,
                ),
              )
            }
            value={row.value}
          />
          <button
            className={buttonClass}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          onClick={() => setRows([...rows, { field: fields[0] ?? "", value: "" }])}
          type="button"
        >
          Add field
        </button>
        <button
          className="rounded-xl bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "Testing…" : "Test"}
        </button>
      </div>
      {message ? (
        <p className="text-sm text-rose-800" role="alert">
          {message}
        </p>
      ) : null}
      {result ? (
        <p
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
          role="status"
        >
          {result.matched
            ? `Rule "${result.rule?.name ?? "unknown"}" would assign ${
                result.user ? `${result.user.fullName} (${result.user.email})` : "this record"
              }.`
            : "No active rule matches. The record would be created without an owner."}
        </p>
      ) : null}
    </section>
  );
}
