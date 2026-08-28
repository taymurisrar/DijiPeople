import type { Metadata } from "next";
import { PromotionsManager } from "@/app/_components/promotions-manager";
import { PageHeader } from "@/app/_components/ui/page-header";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Promotions",
};


export default async function PromotionsPage() {
  const promotions = await apiRequestJson<
    Parameters<typeof PromotionsManager>[0]["initialPromotions"]
  >("/super-admin/promotions").catch(() => []);
  return (
    <main className="space-y-4">
      <PageHeader
        eyebrow="Revenue"
        title="Discounts & promotions"
        description="Versioned commercial discounts for plans, prices, customers, and subscriptions."
      />
      <PromotionsManager initialPromotions={promotions} />
    </main>
  );
}
