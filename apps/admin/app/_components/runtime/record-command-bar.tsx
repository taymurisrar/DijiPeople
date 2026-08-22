"use client";

import { useRouter } from "next/navigation";
import { ModuleActionBar } from "./module-action-bar";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type { PlatformModuleKey } from "@/lib/runtime/platform-runtime.types";
import { runStandardRecordCommand } from "@/lib/runtime/standard-record-commands";

/**
 * The default record command bar for a **server-rendered** detail page.
 *
 * Invoices are the case this exists for: the page is a server component with
 * no client state to hang an action handler off, so it carried a "Back to
 * invoices" text link and nothing else — no Refresh, and none of the module's
 * commands. This renders the registry's record commands and implements the
 * three that are pure navigation, which is all a read-only record needs.
 *
 * A module with governed commands of its own should not use this: those need
 * a handler that knows what they do, which is what the bespoke detail
 * components already provide.
 */
export function RecordCommandBar({
  moduleKey,
  record,
  roleKeys,
  permissionKeys,
  reloadMessage,
}: {
  moduleKey: PlatformModuleKey;
  record: Record<string, unknown>;
  roleKeys: string[];
  permissionKeys: string[];
  reloadMessage?: string;
}) {
  const router = useRouter();
  const definition = getPlatformModuleDefinition(moduleKey);
  return (
    <ModuleActionBar
      actions={definition.actions}
      context={{
        scope: "record",
        mode: "read",
        record,
        roleKeys,
        permissionKeys,
      }}
      onAction={async (action) => {
        const standard = await runStandardRecordCommand(action, {
          routeBase: definition.routeBase,
          router,
          reload: () => router.refresh(),
          reloadMessage,
        });
        if (standard) return standard;
        return {
          success: false,
          message: `${action.label} is not available on this screen.`,
        };
      }}
    />
  );
}
