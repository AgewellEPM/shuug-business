import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceUser } from "../auth/identity";
import { assertPlaintextTaxAllowed } from "../secure-tax/policy";
import type { ModuleRecord } from "../sdk/types";
import { workspaceDatabase } from "../workspace/database";
export function taxModuleRows(db:DatabaseSync,moduleId:string):ModuleRecord[] {
  const row=db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as {body:string}|undefined;
  return row?JSON.parse(row.body)[moduleId]??[]:[];
}
export function assertTaxClientAccess(db:DatabaseSync,clientId:string,user:WorkspaceUser,edit=false) {
  const row=db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(clientId) as {body:string}|undefined;
  if(!row||["archived","inactive","cancelled"].includes(JSON.parse(row.body).status))throw new Error("Choose an active client.");
  assertPlaintextTaxAllowed({clientId},db);
  if(user.isOwner)return JSON.parse(row.body) as {title:string;id:string};
  const books=(db.prepare("SELECT body FROM documents WHERE kind='client-book' AND json_extract(body,'$.clientId')=?").all(clientId) as {body:string}[]).map(r=>JSON.parse(r.body));
  const active = new Map(taxModuleRows(db,"tax-engagements").filter(row=>!row.archived&&row.values.client_id===clientId).map(row=>[row.id,row]));
  const assigned=(db.prepare("SELECT id,body FROM documents WHERE kind='tax-workflow' AND json_extract(body,'$.clientId')=? AND json_extract(body,'$.assignedAccountId')=?").all(clientId,user.id) as {id:string;body:string}[]).some(row=>{
    const flow=JSON.parse(row.body) as {id:string;assignedAccountId?:string};
    return row.id===`tax-workflow:${flow.id}`&&active.get(flow.id)?.values.accountant===user.id;
  });
  if(!assigned&&!books.some(b=>b.grants.some((g:{accountId:string;level:string})=>g.accountId===user.id&&(!edit||g.level==="edit"))))throw new Error("This client is not assigned to your account.");
  return JSON.parse(row.body) as {title:string;id:string};
}

/** Preserve owner access to historical tracker rows, while enrollment still
 * blocks every legacy plaintext projection. Staff need a current assignment. */
export function filterTaxClientRows<T>(db:DatabaseSync,rows:T[],user:WorkspaceUser,clientIdFor:(row:T)=>string|undefined):T[] {
  const permitted=new Map<string|undefined,boolean>();
  return rows.filter(row=>{
    const clientId=clientIdFor(row);
    if(!permitted.has(clientId)) {
      try {
        if(user.isOwner)assertPlaintextTaxAllowed({clientId},db);
        else {if(!clientId)throw new Error("Client reference required.");assertTaxClientAccess(db,clientId,user);}
        permitted.set(clientId,true);
      } catch {permitted.set(clientId,false);}
    }
    return permitted.get(clientId)!;
  });
}
export function taxClientsForUser<T extends {id:string}>(clients:T[],user:WorkspaceUser):T[] {
  return workspaceDatabase(db=>filterTaxClientRows(db,clients,user,client=>client.id));
}
