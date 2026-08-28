import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
import { ContractCreationLauncher } from "@/app/_components/documents/contract-creation-launcher";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New contracts",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    templateId?: string;
    partnerId?: string;
    contractType?: string;
    counterpartyName?: string;
    counterpartyEmail?: string;
  }>;
}) {
  const params = await searchParams;
  const [settings, templates] = await Promise.all([
    apiRequestJson<{
      platformDefaults?: { reportingCurrency?: string; currency?: string };
    }>("/super-admin/platform-settings"),
    apiRequestJson<{
      items: Array<{
        id: string;
        name: string;
        contractType: string;
        versions: Array<{ title: string }>;
      }>;
    }>("/contract-templates"),
  ]);
  const template = templates.items.find(
    (item) => item.id === params.templateId,
  );
  return (
    <div className="space-y-5">
      <ContractCreationLauncher
        mode={params.mode ?? "blank"}
        templates={templates.items}
      />
      {["blank", "template"].includes(params.mode ?? "blank") ? (
        <RuntimeRecordRoute
          moduleKey="contracts"
          initialValues={{
            status: "DRAFT",
            processStage: "INITIATION",
            signingMode: "MIXED",
            documentSource: "BLANK",
            isGoverningAgreement: false,
            contractType:
              params.contractType ?? template?.contractType ?? "SERVICE_AGREEMENT",
            templateId: template?.id ?? "",
            title:
              template?.versions?.[0]?.title ??
              (params.partnerId ? "Master Partner Agreement" : ""),
            partnerId: params.partnerId ?? "",
            counterpartyName: params.counterpartyName ?? "",
            counterpartyEmail: params.counterpartyEmail ?? "",
            currencyCode:
              settings.platformDefaults?.reportingCurrency ??
              settings.platformDefaults?.currency ??
              "USD",
            contentHtml: template
              ? undefined
              : "<h1>Agreement</h1><p>This agreement is between {{platform.legalName}} and {{counterparty.name}}.</p>",
          }}
        />
      ) : null}
    </div>
  );
}
