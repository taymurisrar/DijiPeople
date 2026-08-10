import { PromotionsManager } from "@/app/_components/promotions-manager";
import { PageHeader } from "@/app/_components/ui/page-header";
import { apiRequestJson } from "@/lib/server-api";

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
