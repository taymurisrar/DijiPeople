"use client";

import { useMemo } from "react";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { createClaimsDataAdapter } from "@/lib/runtime/modules/claims-data.adapter";
import {
  CLAIM_LINE_ITEMS_TAB_KEY,
  claimRuntimeSpec,
  myClaimRuntimeSpec,
} from "@/lib/runtime/modules/claims-runtime-specs";
import type { ClaimLineItemRecord } from "../claim-types";
import { ClaimLineItemsEditor } from "./claim-line-items-editor";

/*
 * Every claim record route — /claims and /me/claims, new, detail and edit —
 * renders through this one wrapper, which renders `StandardModuleRecordPage`
 * (record-page-layout-contract.md MUST #1).
 *
 * It exists only because a page is a server component and the claims data
 * adapter is an object of functions, which cannot cross the server/client
 * boundary as a prop. The adapter is built here, on the client, from the spec
 * this wrapper imports itself — so the spec never crosses that boundary
 * either.
 */
export function ClaimRecordPage({
  activeForm,
  canEditLineItems = false,
  mode,
  record,
  recordId,
  runtime,
  surface,
  title,
}: {
  readonly activeForm: FormMetadata | null;
  /*
   * Decided by the server page (DRAFT, and the caller holds the surface's
   * update key), so the editor is never offered where the bespoke page would
   * have rendered the line items read-only.
   */
  readonly canEditLineItems?: boolean;
  readonly mode: "create" | "read" | "edit";
  readonly record: Readonly<Record<string, unknown>>;
  readonly recordId?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly surface: "admin" | "self";
  readonly title?: string;
}) {
  const spec = surface === "self" ? myClaimRuntimeSpec : claimRuntimeSpec;
  const dataAdapter = useMemo(
    () =>
      createClaimsDataAdapter(spec, {
        record: recordId ? record : null,
        allowEmployee: surface === "admin",
      }),
    [record, recordId, spec, surface],
  );

  const tabContent =
    canEditLineItems && recordId
      ? {
          [CLAIM_LINE_ITEMS_TAB_KEY]: (
            <ClaimLineItemsEditor
              basePath={spec.apiPath ?? `/api${spec.routeBase}`}
              claimId={recordId}
              currencyCode={
                typeof record.currencyCode === "string"
                  ? record.currencyCode
                  : ""
              }
              lineItems={
                Array.isArray(record.lineItems)
                  ? (record.lineItems as ClaimLineItemRecord[])
                  : []
              }
            />
          ),
        }
      : undefined;

  return (
    <StandardModuleRecordPage
      activeForm={activeForm}
      dataAdapter={dataAdapter}
      mode={mode}
      record={record}
      recordId={recordId}
      runtime={runtime}
      spec={spec}
      tabContent={tabContent}
      title={title}
    />
  );
}
