import type {DatabaseSync} from "node:sqlite";
import {driverAccount,driverAvailable} from "../rideshare-driver/policy";
import {privateTaxAccount,privateTaxSession,privateAccountTable} from "./private-accounts";
import {SecureTaxError} from "./manifest";
/** Explicit opaque accounts have no legacy customer or service-profile row. */
export function activeSecureAccount(db:DatabaseSync,id:string):{id:string;clientId:string}|null{
  const opaque=privateTaxAccount(db,id);if(opaque)return opaque.status==="active"?{id:opaque.id,clientId:opaque.clientId}:null;
  if(!privateAccountTable(db,"customer_accounts"))return null;
  const account=db.prepare("SELECT id,clientId FROM customer_accounts WHERE id=? AND status='active'").get(id) as {id:string;clientId:string}|undefined;
  if(!account?.clientId)return null;
  const row=db.prepare("SELECT body FROM records WHERE id=? AND kind='client'").get(account.clientId) as {body:string}|undefined;
  return row&&!["archived","inactive","cancelled"].includes(JSON.parse(row.body).status)?account:null;
}
export function secureAccount(db:DatabaseSync,token:string|undefined):{id:string;clientId:string}{
  if(!driverAvailable(db))throw new SecureTaxError(404,"Encrypted client access is not enabled for this workspace.");
  const account=privateTaxSession(db,token);return account?{id:account.id,clientId:account.clientId}:driverAccount(db,token);
}
