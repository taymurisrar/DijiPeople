"use client";

import { useEffect, useId, useState } from "react";
import {
  DialogField,
  PanelButton,
  PanelDialog,
  dialogInputClass,
} from "../tenants/tenant-panel-ui";
import type { SupportCaseDialogAction } from "@/lib/runtime/support-case-actions";

type Option = { value: string; label: string };
type CaseOption = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
};

const TEAM_LOOKUP = "/platform-teams?active=true&category=SUPPORT";
const OWNER_LOOKUP = "/platform-users/owner-candidates";
const textareaClass =
  "min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10";

/*
 * Suggestions only: resolution category is free text on the case (and the
 * merge path writes DUPLICATE), so a fixed select would refuse values that
 * existing cases already carry.
 */
const RESOLUTION_CATEGORIES = [
  "FIXED",
  "WORKAROUND",
  "CONFIGURATION",
  "CUSTOMER_EDUCATION",
  "NOT_REPRODUCIBLE",
  "DUPLICATE",
  "WONT_FIX",
];

const COPY: Record<
  SupportCaseDialogAction,
  { title: string; description: string; confirm: string; danger?: boolean }
> = {
  "assign-case": {
    title: "Assign case",
    description: "Choose a support owner, a support team, or both.",
    confirm: "Assign",
  },
  "escalate-case": {
    title: "Escalate case",
    description:
      "Raises the escalation level by one. A case not yet being investigated moves to Investigating.",
    confirm: "Escalate",
  },
  "request-info": {
    title: "Request information",
    description:
      "The message is recorded on the case and emailed to the customer. The case then waits on the customer.",
    confirm: "Send request",
  },
  "resolve-case": {
    title: "Resolve case",
    description: "A resolution summary and category are required.",
    confirm: "Resolve",
  },
  "close-case": {
    title: "Close case",
    description: "Closing ends work on the case. It can be reopened with a reason.",
    confirm: "Close case",
  },
  "link-case": {
    title: "Link case",
    description: "Link a case for the same customer or tenant.",
    confirm: "Link",
  },
  "merge-case": {
    title: "Merge into another case",
    description:
      "This case closes as a duplicate and becomes read-only. Its communications, attachments, incidents, links and child cases move to the target.",
    confirm: "Merge",
    danger: true,
  },
};

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      (Array.isArray(payload?.message)
        ? payload.message.join(" ")
        : payload?.message) ?? "The case could not be updated.",
    );
  return payload;
}

function useLookup(path: string, enabled: boolean) {
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`/api/platform-runtime/lookups?path=${encodeURIComponent(path)}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload: { items?: Option[] }) => {
        if (live) setOptions(payload.items ?? []);
      })
      .catch(() => {
        if (live) setOptions([]);
      });
    return () => {
      live = false;
    };
  }, [path, enabled]);
  return options;
}

/**
 * Finds a case by number or title through the support case list — never a
 * raw id field. The current case is excluded, and for a merge so is any case
 * that could not be a target (merged, closed, cancelled).
 */
function CasePicker({
  currentCaseId,
  forMerge,
  value,
  onChange,
}: {
  currentCaseId: string;
  forMerge: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CaseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({ pageSize: "20" });
      if (search.trim()) query.set("search", search.trim());
      fetch(`/api/support-cases?${query.toString()}`)
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .then((payload: { items?: Array<Record<string, unknown>> }) => {
          if (!live) return;
          setItems(
            (payload.items ?? [])
              .filter((item) => item.id !== currentCaseId)
              .filter(
                (item) =>
                  !forMerge ||
                  (!item.mergedIntoCaseId &&
                    !["CLOSED", "CANCELLED"].includes(String(item.status))),
              )
              .map((item) => ({
                id: String(item.id),
                caseNumber: String(item.caseNumber ?? ""),
                title: String(item.title ?? ""),
                status: String(item.status ?? ""),
              })),
          );
        })
        .catch(() => live && setItems([]))
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, currentCaseId, forMerge]);

  return (
    <div className="grid gap-2">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by case number or title"
        aria-controls={listId}
        className={dialogInputClass}
      />
      <div
        id={listId}
        role="radiogroup"
        aria-label="Matching cases"
        aria-busy={loading}
        className="max-h-56 overflow-y-auto rounded-lg border border-slate-200"
      >
        {items.length ? (
          items.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 ${value === item.id ? "bg-slate-50" : ""}`}
            >
              <input
                type="radio"
                name={`${listId}-case`}
                checked={value === item.id}
                onChange={() => onChange(item.id)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900">
                  {item.caseNumber}
                </span>
                <span className="block truncate text-slate-600">
                  {item.title}
                </span>
                <span className="block text-xs text-slate-500">
                  {item.status.toLowerCase().replaceAll("_", " ")}
                </span>
              </span>
            </label>
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-slate-500">
            {loading ? "Searching…" : "No matching cases."}
          </p>
        )}
      </div>
    </div>
  );
}

export function SupportCaseActionDialog({
  action,
  record,
  onClose,
  onComplete,
}: {
  action: SupportCaseDialogAction;
  record: Record<string, unknown>;
  onClose: () => void;
  onComplete: (message: string) => Promise<void> | void;
}) {
  const caseId = String(record.id ?? "");
  const copy = COPY[action];
  const [ownerId, setOwnerId] = useState(String(record.assignedToUserId ?? ""));
  const [teamId, setTeamId] = useState(String(record.assignedTeamId ?? ""));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [confirmClosure, setConfirmClosure] = useState(false);
  const [targetCaseId, setTargetCaseId] = useState("");
  const [relationType, setRelationType] = useState("RELATED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const categoriesId = useId();

  const needsOwners = action === "assign-case" || action === "escalate-case";
  const owners = useLookup(OWNER_LOOKUP, needsOwners);
  const teams = useLookup(TEAM_LOOKUP, needsOwners);

  const valid = (() => {
    switch (action) {
      case "assign-case":
        return Boolean(ownerId || teamId);
      case "escalate-case":
        return reason.trim().length >= 3;
      case "request-info":
        return message.trim().length >= 3;
      case "resolve-case":
        return summary.trim().length >= 3 && category.trim().length >= 2;
      case "close-case":
        return true;
      case "link-case":
        return Boolean(targetCaseId);
      case "merge-case":
        return Boolean(targetCaseId) && reason.trim().length >= 3;
    }
  })();

  async function submit() {
    setBusy(true);
    setError("");
    const base = `/api/support-cases/${encodeURIComponent(caseId)}`;
    try {
      let done = "Case updated.";
      if (action === "assign-case") {
        await postJson(`${base}/assign`, {
          assignedToUserId: ownerId || null,
          assignedTeamId: teamId || null,
        });
        done = "Case assigned.";
      } else if (action === "escalate-case") {
        await postJson(`${base}/escalate`, {
          reason: reason.trim(),
          ...(teamId && teamId !== record.assignedTeamId
            ? { assignedTeamId: teamId }
            : {}),
          ...(ownerId && ownerId !== record.assignedToUserId
            ? { assignedToUserId: ownerId }
            : {}),
        });
        done = "Case escalated.";
      } else if (action === "request-info") {
        await postJson(`${base}/request-info`, {
          customerMessage: message.trim(),
        });
        done = "Information requested from the customer.";
      } else if (action === "resolve-case") {
        await postJson(`${base}/resolve`, {
          resolutionSummary: summary.trim(),
          resolutionCategory: category.trim(),
          ...(rootCause.trim() ? { rootCause: rootCause.trim() } : {}),
        });
        done = "Case resolved.";
      } else if (action === "close-case") {
        await postJson(`${base}/transition`, {
          toStatus: "CLOSED",
          ...(confirmClosure ? { confirmClosure: true } : {}),
        });
        done = "Case closed.";
      } else if (action === "link-case") {
        await postJson(`${base}/relations`, {
          targetCaseId,
          relationType,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        done = "Cases linked.";
      } else if (action === "merge-case") {
        await postJson(`${base}/merge`, {
          targetCaseId,
          reason: reason.trim(),
        });
        done = "Case merged.";
      }
      await onComplete(done);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelDialog
      title={copy.title}
      description={copy.description}
      tone={copy.danger ? "danger" : "default"}
      wide={action === "link-case" || action === "merge-case"}
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant={copy.danger ? "danger" : "primary"}
            disabled={!valid}
            busy={busy}
            onClick={() => void submit()}
          >
            {copy.confirm}
          </PanelButton>
        </>
      }
    >
      {needsOwners ? (
        <>
          <DialogField label="Support owner">
            <select
              className={dialogInputClass}
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">No owner</option>
              {owners.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </DialogField>
          <DialogField label="Support team">
            <select
              className={dialogInputClass}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">No team</option>
              {teams.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </DialogField>
        </>
      ) : null}

      {action === "escalate-case" || action === "merge-case" ? (
        <DialogField
          label={action === "merge-case" ? "Reason for merging" : "Reason for escalation"}
          required
        >
          <textarea
            className={textareaClass}
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
        </DialogField>
      ) : null}

      {action === "request-info" ? (
        <DialogField
          label="Message to the customer"
          hint="Sent to the requester or the customer's primary contact."
          required
        >
          <textarea
            className={textareaClass}
            value={message}
            maxLength={10000}
            onChange={(event) => setMessage(event.target.value)}
          />
        </DialogField>
      ) : null}

      {action === "resolve-case" ? (
        <>
          <DialogField label="Resolution summary" required>
            <textarea
              className={textareaClass}
              value={summary}
              maxLength={10000}
              onChange={(event) => setSummary(event.target.value)}
            />
          </DialogField>
          <DialogField label="Resolution category" required>
            <input
              className={dialogInputClass}
              value={category}
              maxLength={160}
              list={categoriesId}
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id={categoriesId}>
              {RESOLUTION_CATEGORIES.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </DialogField>
          <DialogField label="Root cause">
            <textarea
              className={textareaClass}
              value={rootCause}
              maxLength={10000}
              onChange={(event) => setRootCause(event.target.value)}
            />
          </DialogField>
        </>
      ) : null}

      {action === "close-case" ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmClosure}
            onChange={(event) => setConfirmClosure(event.target.checked)}
            className="mt-0.5"
          />
          The customer confirmed the resolution.
        </label>
      ) : null}

      {action === "link-case" || action === "merge-case" ? (
        // A fieldset, not DialogField: the picker holds several controls, and
        // DialogField's <label> wrapper may contain only one.
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {action === "merge-case" ? "Target case" : "Case to link"}
            <span className="ml-1 text-rose-600">*</span>
          </legend>
          <div className="mt-1">
            <CasePicker
              currentCaseId={caseId}
              forMerge={action === "merge-case"}
              value={targetCaseId}
              onChange={setTargetCaseId}
            />
          </div>
        </fieldset>
      ) : null}

      {action === "link-case" ? (
        <>
          <DialogField label="Relationship" required>
            <select
              className={dialogInputClass}
              value={relationType}
              onChange={(event) => setRelationType(event.target.value)}
            >
              <option value="RELATED">Related to</option>
              <option value="DUPLICATE">Duplicate of</option>
              <option value="BLOCKS">Blocks</option>
            </select>
          </DialogField>
          <DialogField label="Note">
            <input
              className={dialogInputClass}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </DialogField>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </PanelDialog>
  );
}
