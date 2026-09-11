import { requireSectionAccess } from "@/lib/permissions/guard";
import { CustomerImport } from "@/components/CustomerImport";
import { getQboTokens } from "@/lib/integrations/token-store";
export const dynamic="force-dynamic";
export default async function CustomerImportPage(){
  await requireSectionAccess("sales", "view");
return <CustomerImport quickbooksConnected={!!getQboTokens()}/>;}
