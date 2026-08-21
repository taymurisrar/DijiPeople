"use client";

import { getPlatformModuleDefinition } from "./platform-module-registry";
import type {
  PlatformModuleKey,
  RuntimeActionDefinition,
} from "./platform-runtime.types";

/**
 * Back, New and Refresh for the record pages that are **not** the runtime.
 *
 * Five modules render a bespoke detail component — contract templates,
 * signature requests, invoices, partner inquiries and partner onboarding —
 * because each carries a governed interaction the runtime form cannot express.
 * They still take their command bar from the registry, so `define()`'s default
 * commands reach them too; what they did not have was an implementation for
 * those commands, which is how a Refresh button can render and do nothing.
 *
 * `runStandardRecordCommand` returns `null` when the command is not one of the
 * three, so a caller can delegate first and keep its own handling for the
 * actions that belong to it.
 */
export async function runStandardRecordCommand(
  action: RuntimeActionDefinition,
  context: {
    routeBase: string;
    router: { push(href: string): void };
    reload: () => Promise<void> | void;
    /** What Refresh says once the record has been re-read. */
    reloadMessage?: string;
  },
): Promise<{ success: boolean; message?: string } | null> {
  if (action.key === "back") {
    context.router.push(context.routeBase);
    return { success: true };
  }
  if (action.key === "record-new") {
    context.router.push(`${context.routeBase}/new`);
    return { success: true };
  }
  if (action.key === "record-refresh") {
    await context.reload();
    return {
      success: true,
      message: context.reloadMessage ?? "Record reloaded.",
    };
  }
  return null;
}

/**
 * The registry's command bar for a module, with the page's own commands merged
 * in on top — same rule the registry itself uses, so a bespoke page can
 * override a default's label or states without losing the rest.
 */
export function standardRecordActions(
  moduleKey: PlatformModuleKey,
  own: RuntimeActionDefinition[] = [],
): RuntimeActionDefinition[] {
  const identity = (action: RuntimeActionDefinition) =>
    `${action.key}::${action.scope}`;
  const ownIds = new Set(own.map(identity));
  return [
    ...getPlatformModuleDefinition(moduleKey).actions.filter(
      (action) => !ownIds.has(identity(action)),
    ),
    ...own,
  ];
}
