import { requireSectionAccess } from "@/lib/permissions/guard";
import { restaurantFinanceData } from "@/lib/restaurant/management";
import { RestaurantOperations } from "@/components/restaurant/RestaurantOperations";
import { reportPageQuery } from "@/lib/restaurant/report-model";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function RestaurantFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSectionAccess("money", "view"); let edit = false; try { await requireSectionAccess("money", "edit"); edit = true; } catch {}
  const params = await searchParams, tab = params.tab;
  let data; try { data = restaurantFinanceData(reportPageQuery(params)); } catch (e) { return <div role="alert">{e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not read restaurant reports."} <a href="/restaurant/finance?tab=reports" className="underline">Reset report filters</a></div>; }
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">Restaurant books and sales patterns</h1><RestaurantOperations initial={data} initialTab={tab === "reports" || tab === "stocktakes" || tab === "credits" ? tab : "money"} canEdit={false} canManageMoney={edit} canConfigure={false} allowedTabs={["money", "reports", "stocktakes", "credits"]} readEndpoint="/api/restaurant/finance"/></div>;
}
