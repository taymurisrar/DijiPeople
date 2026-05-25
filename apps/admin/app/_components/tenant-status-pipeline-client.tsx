"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CrmStatusPipeline } from "@/app/_components/crm-status-pipeline";
import {
  entityPipelineConfigs,
  getMissingPipelineFields,
  type PipelineFormState,
  type PipelineStage,
} from "@/app/_components/entity-pipeline-config";

type TenantStatusPipelineClientProps = {
  currentStatus: string;
  form: PipelineFormState;
  tenantId: string;
};

export function TenantStatusPipelineClient({
  currentStatus,
  form,
  tenantId,
}: TenantStatusPipelineClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pipelineForm = useMemo(() => ({ ...form, status }), [form, status]);

  function handleStageChange(stage: PipelineStage) {
    const missing = getMissingPipelineFields(stage, pipelineForm);
    if (missing.length) {
      setMessage(
        `${missing[0].label} is required before moving to ${stage.label}.`,
      );
      const firstField = document.querySelector<HTMLElement>(
        `[data-field-key="${missing[0].key}"]`,
      );
      firstField?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setMessage(null);
    setStatus(stage.statusValue);
    startTransition(async () => {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: stage.statusValue }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to update tenant status.");
        setStatus(currentStatus);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <CrmStatusPipeline
        currentStatus={status}
        disabled={isPending}
        form={pipelineForm}
        onStageChange={handleStageChange}
        stages={entityPipelineConfigs.tenant.stages}
      />
      {message ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {message}
        </p>
      ) : null}
    </div>
  );
}
