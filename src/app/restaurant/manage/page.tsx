import Link from "next/link";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { restaurantManagementData } from "@/lib/restaurant/management";
import { RestaurantOperations } from "@/components/restaurant/RestaurantOperations";
import { reportPageQuery } from "@/lib/restaurant/report-model";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function RestaurantOperationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSectionAccess("operations", "view"); const user = await requireIdentity();
  let financial = false, edit = false, moneyEdit = false;
  try { await requireSectionAccess("money", "view"); financial = true; } catch {}
  try { await requireSectionAccess("operations", "edit"); edit = true; } catch {}
  try { await requireSectionAccess("money", "edit"); moneyEdit = true; } catch {}
  const params = await searchParams;
  let data; try { data = restaurantManagementData(financial, reportPageQuery(params)); } catch (e) { return <div role="alert">{e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Could not read restaurant reports."} <Link href="/restaurant/manage" className="underline">Reset report filters</Link></div>; }
  return <div><Link href="/restaurant" className="text-sm underline">Reservations, floor and kitchen</Link><h1 className="my-4 text-3xl font-semibold">Restaurant operations</h1><RestaurantOperations initial={data} initialTab={typeof params.tab === "string" ? params.tab : "orders"} canEdit={edit} canManageMoney={moneyEdit} canConfigure={user.isOwner}/></div>;
}
