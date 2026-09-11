import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { diningManagementData } from "@/lib/restaurant/dining";
import { DiningSettings } from "@/components/restaurant/DiningSettings";
export const dynamic = "force-dynamic";
export default async function ReservationSettingsPage() {
  await requireSectionAccess("operations", "view"); const user = await requireIdentity();
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">Restaurant reservations</h1><p>Publish the tables, service windows and booking rules that guests can use on your website.</p><DiningSettings initial={diningManagementData()} canConfigure={user.isOwner}/></div>;
}
