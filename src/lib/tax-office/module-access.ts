import type { WorkspaceUser } from "../auth/identity";
import type { ModuleRecord } from "../sdk/types";
import { changeModuleRecords, listRecords } from "../sdk/records";
import { workspaceDatabase } from "../workspace/database";
import { assertTaxClientAccess, filterTaxClientRows } from "./access";

const taxModules=new Set(["tax-engagements","tax-document-requests","tax-filing-handoffs","rideshare-tax-records","tax-quarterly-reviews"]);
export const isTaxModule=(moduleId:string)=>taxModules.has(moduleId);
export function moduleRecordsForUser(moduleId:string,user:WorkspaceUser):ModuleRecord[] {
  const records=listRecords(moduleId);
  if(!isTaxModule(moduleId))return records;
  return workspaceDatabase(db=>filterTaxClientRows(db,records,user,row=>typeof row.values.client_id==="string"?row.values.client_id:undefined));
}

/** The enclosing module transaction also covers the original store mutation.
 * Revocation or enrollment cannot interleave between the check and its write. */
export function withTaxModuleMutation<T>(moduleId:string,user:WorkspaceUser,scope:{id?:string;values?:Record<string,unknown>},mutate:()=>T):T {
  if(!isTaxModule(moduleId))return mutate();
  return changeModuleRecords(moduleId,(records,db)=>{
    if(scope.id) {
      const prior=records.find(row=>row.id===scope.id);
      if(!prior)throw new Error("Tax record unavailable.");
      assertTaxClientAccess(db,String(prior.values.client_id??""),user,true);
    }
    if(scope.values)assertTaxClientAccess(db,String(scope.values.client_id??""),user,true);
    return mutate();
  });
}
