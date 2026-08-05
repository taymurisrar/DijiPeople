"use client";

import { useRouter } from "next/navigation";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import type { RuntimeActionDefinition } from "@/lib/runtime/platform-runtime.types";

const actions: RuntimeActionDefinition[] = [
  {
    key: "back",
    label: "Back",
    placement: "secondary",
    scope: "record",
    selection: "none",
  },
  {
    key: "duplicate",
    label: "Duplicate",
    placement: "primary",
    scope: "record",
    selection: "none",
  },
];

export function PlanDetailActionBar({ planId }: { planId: string }) {
  const router = useRouter();
  return (
    <ModuleActionBar
      actions={actions}
      context={{
        scope: "record",
        record: { id: planId },
        roleKeys: [],
        permissionKeys: [],
        isDirty: false,
        mode: "read",
      }}
      onAction={(action) => {
        router.push(
          action.key === "duplicate"
            ? `/plans/new?sourcePlanId=${planId}`
            : "/plans",
        );
      }}
    />
  );
}
