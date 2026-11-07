import type { ReactNode } from "react";
import { FEATURE_KEYS } from "@/lib/security-keys";
import { ModulePlanGate } from "../_components/module-plan-gate";

export default function RecruitmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ModulePlanGate featureKey={FEATURE_KEYS.RECRUITMENT}>
      {children}
    </ModulePlanGate>
  );
}
