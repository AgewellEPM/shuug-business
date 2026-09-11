import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { specialManagementData } from "@/lib/restaurant/special-management";
import { RestaurantSpecials } from "@/components/restaurant/RestaurantSpecials";
export const dynamic = "force-dynamic";
export default async function RestaurantSpecialsPage() {
  await requireSectionAccess("marketing", "view"); const user = await requireIdentity(); let edit = false, money = false, moneyView = false;
  try { await requireSectionAccess("marketing", "edit"); edit = true; } catch {}
  try { await requireSectionAccess("money", "edit"); money = true; } catch {}
  try { await requireSectionAccess("money", "view"); moneyView = true; } catch {}
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">Restaurant specials</h1><p>Review a limited offer, publish it to ordering, and measure its recorded results.</p><RestaurantSpecials initial={specialManagementData(moneyView)} canEdit={edit} canPublish={user.isOwner} canRecordSpend={money}/></div>;
}
