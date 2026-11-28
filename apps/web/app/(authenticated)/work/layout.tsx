import type { ReactNode } from "react";
import { FEATURE_KEYS } from "@/lib/security-keys";
import { ModulePlanGate } from "../_components/module-plan-gate";

export default function WorkLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePlanGate featureKey={FEATURE_KEYS.WORK_MANAGEMENT}>
      {children}
    </ModulePlanGate>
  );
}
