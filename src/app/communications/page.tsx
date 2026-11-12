import { requireOwnerAccess } from "@/lib/auth/identity";
import { communicationSnapshot } from "@/lib/communications/store";
import { communicationConnectionStatus } from "@/lib/communications/provider";
import { CommunicationsWorkspace } from "@/components/CommunicationsWorkspace";
export const dynamic = "force-dynamic";
export default async function CommunicationsPage() {
  await requireOwnerAccess();
  return <CommunicationsWorkspace initial={{ ...communicationSnapshot(), connections: communicationConnectionStatus() }}/>;
}
