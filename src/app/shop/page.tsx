import { requireOwnerAccess } from "@/lib/auth/identity";
import { shopAutomationState } from "@/lib/shop-automation/service";
import { appBaseUrl } from "@/lib/connections/vault";
import { ShopAutomationWorkspace } from "@/components/ShopAutomationWorkspace";
export const dynamic = "force-dynamic";
export default async function ShopPage() {
  await requireOwnerAccess();
  return <ShopAutomationWorkspace initial={shopAutomationState()} origin={appBaseUrl()}/>;
}
