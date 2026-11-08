import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireIdentity } from "@/lib/auth/identity";
import { listBusinessRecords } from "@/lib/workspace/store";
import { listEmployeeAccounts } from "@/lib/auth/employees";
import { taxOfficeView } from "@/lib/tax-office/service";
import { TaxOfficeWorkspace } from "@/components/TaxOfficeWorkspace";
export const dynamic="force-dynamic";
export default async function TaxOfficePage(){
  await requireSectionAccess("services","view");const user=await requireIdentity();let canEdit=false,canMoney=false;
  try{await requireSectionAccess("services","edit");canEdit=true;}catch{}
  try{await requireSectionAccess("money","view");canMoney=true;}catch{}
  return <TaxOfficeWorkspace cases={taxOfficeView(user)} clients={user.isOwner?listBusinessRecords(["client"]).filter(c=>!["inactive","archived","cancelled"].includes(c.status)).map(c=>({id:c.id,name:c.title})):[]} employees={user.isOwner?listEmployeeAccounts().filter(e=>e.status==="active").map(e=>({id:e.id,name:e.name})):[]} canEdit={canEdit} owner={user.isOwner} canMoney={canMoney}/>;
}
