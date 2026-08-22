"use client";

import type { createHttpModuleRuntimeAdapter } from "./http-module-runtime-adapter";
import type {
  PlatformModuleKey,
  RuntimeActionDefinition,
  RuntimeRecord,
} from "./platform-runtime.types";

type RuntimeAdapter = ReturnType<typeof createHttpModuleRuntimeAdapter>;
type ActionResult = { success?: boolean; message?: string } | void;

export async function executeRuntimeRecordAction(input: {
  action: RuntimeActionDefinition;
  moduleKey: PlatformModuleKey;
  record: RuntimeRecord;
  values: Record<string, unknown>;
  routeBase: string;
  adapter: RuntimeAdapter;
  router: { push(href: string): void };
  save(close: boolean): Promise<ActionResult>;
  reloadRecord(): Promise<void>;
  resetForm(): void;
  enterEditMode(): void;
  leaveEditMode(): void;
  openSignatureDialog(): void;
  /**
   * Collect a governed reason through the design system.
   *
   * Injected rather than called directly because this module is not a
   * component and cannot render — which is exactly why `window.prompt` was
   * used here, and why the reasons it collected reached audited records
   * unlabelled and unvalidated (BUG-0020). Resolves to null when cancelled.
   */
  requestReason(request: {
    title: string;
    description?: string;
    label: string;
    hint?: string;
    confirmLabel: string;
    tone?: "default" | "danger";
    minLength?: number;
  }): Promise<string | null>;
}): Promise<ActionResult> {
  const {
    action,
    moduleKey,
    record,
    values,
    routeBase,
    adapter,
    router,
    save,
    reloadRecord,
    resetForm,
    enterEditMode,
    leaveEditMode,
    openSignatureDialog,
    requestReason,
  } = input;

  if (action.key === "back") return router.push(routeBase);
  if (action.key === "record-new") return router.push(`${routeBase}/new`);
  if (action.key === "edit") return enterEditMode();
  if (action.key === "save") return save(false);
  if (action.key === "save-close") return save(true);
  if (action.key === "cancel") {
    resetForm();
    return leaveEditMode();
  }
  /*
   * Refresh discards unsaved edits by design — it is the operator's way of
   * asking what the record looks like on the server, which is not a question
   * that can be answered while the form still holds their draft. Leaving edit
   * mode makes that visible instead of silently repopulating the inputs they
   * were typing into.
   */
  if (action.key === "record-refresh") {
    await reloadRecord();
    leaveEditMode();
    return { success: true, message: "Record reloaded." };
  }
  if (action.key === "delete") {
    const result = await adapter.deleteRecord(record.id);
    if (result.success) router.push(routeBase);
    return result;
  }

  if (action.key === "create-agreement") {
    const sourceType = agreementSourceType(moduleKey);
    if (sourceType) {
      router.push(
        `/contracts/new?mode=source&sourceType=${sourceType}&sourceId=${encodeURIComponent(record.id)}`,
      );
      return;
    }
    if (moduleKey === "partners") {
      router.push(
        `/contracts/new?partnerId=${encodeURIComponent(record.id)}&contractType=MASTER_PARTNER_AGREEMENT&counterpartyName=${encodeURIComponent(String(values.displayName ?? ""))}&counterpartyEmail=${encodeURIComponent(String(values.email ?? ""))}`,
      );
      return;
    }
  }

  if (moduleKey === "leads" && action.key === "qualify") {
    const result = await adapter.changeStatus(record.id, "QUALIFIED");
    await reloadRecord();
    return result;
  }
  if (moduleKey === "leads" && action.key === "disqualify") {
    const reason = await requestReason({
      title: "Disqualify lead",
      description:
        "The reason is stored on the lead and is read later by whoever reviews why it was not pursued.",
      label: "Disqualification reason",
      confirmLabel: "Disqualify lead",
      tone: "danger",
    });
    if (!reason) return;
    const result = await adapter.changeStatus(
      record.id,
      "UNQUALIFIED",
      reason,
    );
    await reloadRecord();
    return result;
  }
  if (moduleKey === "leads" && action.key === "convert") {
    const result = await adapter.executeAction("convert", { id: record.id });
    const converted = result.data as Record<string, unknown> | undefined;
    const customerId = String(converted?.id ?? converted?.customerId ?? "");
    if (customerId) router.push(`/customers/${customerId}`);
    else await reloadRecord();
    return result;
  }
  if (moduleKey === "customers" && action.key === "start-onboarding") {
    return router.push(
      `/onboarding/new?customerId=${encodeURIComponent(record.id)}`,
    );
  }

  if (moduleKey === "contracts" && action.key === "submit") {
    await postContractAction(record.id, "submit-approval", {});
    await reloadRecord();
    return { success: true, message: "Contract submitted for approval." };
  }
  if (
    moduleKey === "contracts" &&
    ["stage-back", "stage-forward"].includes(action.key)
  ) {
    const backward = action.key === "stage-back";
    let reason: string | undefined;
    if (backward) {
      const entered = await requestReason({
        title: "Move contract backward",
        description:
          "Moving a contract back a stage is recorded against it. The reason explains the reversal to anyone auditing the agreement later.",
        label: "Reason for moving this contract backward",
        confirmLabel: "Move backward",
        tone: "danger",
      });
      if (!entered) return;
      reason = entered;
    }
    await postContractAction(record.id, "transition", {
      direction: backward ? "backward" : "forward",
      reason,
    });
    await reloadRecord();
    return { success: true, message: "Contract stage updated." };
  }
  if (moduleKey === "contracts" && action.key === "generate-document") {
    const response = await fetch(`/api/contracts/${record.id}/generate/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error("Unable to generate the contract PDF.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${String(values.contractNumber ?? "contract")}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { success: true, message: "Contract PDF generated." };
  }
  if (moduleKey === "contracts" && action.key === "send-signature") {
    return openSignatureDialog();
  }
  if (moduleKey === "contracts" && action.key === "duplicate") {
    const response = await fetch("/api/contracts/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceContractId: record.id,
        title: `Copy of ${String(values.title ?? "contract")}`,
        counterpartyName: values.counterpartyName,
        counterpartyEmail: values.counterpartyEmail || undefined,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(payload?.message ?? "Unable to duplicate contract.");
    router.push(`/contracts/${payload.id}`);
    return { success: true, message: "Contract duplicated." };
  }
  if (moduleKey === "contracts" && ["approve", "reject"].includes(action.key)) {
    const requests = Array.isArray(values.approvalRequests)
      ? (values.approvalRequests as Array<Record<string, unknown>>)
      : [];
    const pending = requests.find((item) => item.status === "PENDING");
    if (!pending) throw new Error("No pending approval request was found.");
    const response = await fetch(
      `/api/platform-approvals/${String(pending.id)}/${action.key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment:
            action.key === "approve"
              ? "Approved in Platform Admin."
              : "Returned for correction from Platform Admin.",
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload?.message ?? `Unable to ${action.key} contract.`);
    await reloadRecord();
    return {
      success: true,
      message:
        action.key === "approve"
          ? "Approval completed."
          : "Contract returned for correction.",
    };
  }

  return adapter.executeAction(action.key, { id: record.id });
}

function agreementSourceType(moduleKey: PlatformModuleKey) {
  if (moduleKey === "leads") return "lead";
  if (moduleKey === "customers") return "customer";
  if (moduleKey === "customer-onboarding") return "onboarding";
  if (moduleKey === "tenants") return "tenant";
  return null;
}

async function postContractAction(
  recordId: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`/api/contracts/${recordId}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.message ?? "Unable to update the contract.");
  return payload;
}
