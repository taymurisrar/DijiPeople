"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PanelButton, PanelDialog } from "../tenants/tenant-panel-ui";
import {
  buildDependencyDeleteModel,
  describeDependencyCount,
  type DependencyDeleteTarget,
} from "@/lib/runtime/dependency-delete-model";
import type { RecordDependencyReport } from "@/lib/runtime/platform-runtime.types";

/**
 * Most selected records checked before a bulk delete. Past this the dialog
 * says how many were not checked; the API still refuses, by name, whatever
 * blocks among the rest.
 */
const MAX_CHECKED = 25;

/**
 * The delete confirmation that asks the API what the delete would do first
 * (EXECPLAN-0055 D5).
 *
 * Blocking dependencies are listed with their count, the reason and a link to
 * the related records, and Confirm stays disabled while nothing in the
 * selection could be deleted. Records that would be deleted along with this
 * one are listed as such, so a cascade is never a surprise. A module the API
 * has no dependency provider for gets the plain confirmation.
 */
export function DependencyAwareDeleteDialog({
  title,
  description,
  names,
  targets,
  getDependencies,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  names: string[];
  targets: Array<{ id: string; label: string }>;
  getDependencies: (id: string) => Promise<RecordDependencyReport | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const checked = useMemo(() => targets.slice(0, MAX_CHECKED), [targets]);
  const [state, setState] = useState<DependencyDeleteTarget[]>(() =>
    checked.map((target) => ({ ...target })),
  );

  useEffect(() => {
    // The dialog mounts once per confirmation with a snapshotted selection, so
    // the initial state above is already the loading state for these targets.
    let cancelled = false;
    void Promise.all(
      checked.map(async (target): Promise<DependencyDeleteTarget> => {
        try {
          return { ...target, report: await getDependencies(target.id) };
        } catch (error) {
          return {
            ...target,
            error:
              error instanceof Error
                ? error.message
                : "The dependency check failed.",
          };
        }
      }),
    ).then((results) => {
      if (!cancelled) setState(results);
    });
    return () => {
      cancelled = true;
    };
  }, [checked, getDependencies]);

  const model = useMemo(() => buildDependencyDeleteModel(state), [state]);
  const unchecked = targets.length - checked.length;

  return (
    <PanelDialog
      title={title}
      description={description}
      tone="danger"
      onClose={onCancel}
      wide={model.status === "ready" && model.blockedCount > 0}
      footer={
        <>
          <PanelButton onClick={onCancel}>Cancel</PanelButton>
          <PanelButton
            variant="danger"
            disabled={!model.canConfirm}
            title={model.disabledReason ?? undefined}
            onClick={onConfirm}
          >
            {model.status === "ready" &&
            model.blockedCount > 0 &&
            model.canConfirm &&
            unchecked === 0
              ? `Delete ${model.deletableCount}`
              : "Delete"}
          </PanelButton>
        </>
      }
    >
      {names.length ? (
        <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          {names.map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      {model.status === "loading" ? (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {model.disabledReason}
        </p>
      ) : null}

      {model.errors.length ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <p className="font-semibold">{model.disabledReason}</p>
          <ul className="mt-1 list-disc pl-5">
            {model.errors.map((item) => (
              <li key={item.id}>
                {item.label}: {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.status === "ready"
        ? model.records.map((record) =>
            record.blocking.length ||
            record.cascading.length ||
            record.detaching.length ? (
              <section
                key={record.id}
                aria-label={record.label}
                className="mt-3 rounded-xl border border-slate-200 p-3"
              >
                {model.records.length > 1 ? (
                  <h3 className="text-sm font-semibold text-slate-900">
                    {record.label}
                    {record.blocked ? " — will be kept" : ""}
                  </h3>
                ) : null}
                {record.blocking.length ? (
                  <>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700">
                      Blocks the delete
                    </p>
                    <ul className="mt-1 space-y-2 text-sm text-slate-700">
                      {record.blocking.map((item) => (
                        <li key={item.key}>
                          <span className="font-semibold text-slate-900">
                            {describeDependencyCount(item)}
                          </span>
                          {item.href ? (
                            <>
                              {" "}
                              <Link
                                href={item.href}
                                onClick={onCancel}
                                className="font-semibold text-sky-700 underline underline-offset-2"
                              >
                                View
                              </Link>
                            </>
                          ) : null}
                          <span className="block text-xs text-slate-600">
                            {item.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {record.cascading.length && !record.blocked ? (
                  <>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Will also be deleted
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {record.cascading.map((item) => (
                        <li key={item.key}>{describeDependencyCount(item)}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {record.detaching.length && !record.blocked ? (
                  <>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Will be kept, unlinked
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {record.detaching.map((item) => (
                        <li key={item.key}>{describeDependencyCount(item)}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null,
          )
        : null}

      {unchecked > 0 && model.status === "ready" ? (
        <p className="mt-3 text-xs text-slate-600">
          {unchecked} more selected not checked here.
        </p>
      ) : null}
    </PanelDialog>
  );
}
