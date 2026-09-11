import { requireSectionAccess } from "@/lib/permissions/guard";
import { loadWorkspace } from "@/lib/data/workspace";
import { BusinessDirectory } from "@/components/BusinessDirectory";
export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  await requireSectionAccess("sales", "view");
 return <BusinessDirectory {...await loadWorkspace()} mode="orders"/>; }
