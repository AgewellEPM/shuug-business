import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {secureAccount,activeSecureAccount} from "./account-scope";
import {secureStaffIdentity} from "./staff-session";
import {privateAccountTable} from "./private-accounts";
import {SecureTaxError,verifyRecipientManifestDocument,verifyRecipientManifest} from "./manifest";
import {secureTaxEnrollment,enrollSecureTaxAccount} from "./store";
import {secureTaxId,signedRecipientManifest,canonicalManifest} from "./envelope";

const packetSchema=z.object({version:z.literal(1),type:z.literal("shuug-enrollment-renewal"),previous:signedRecipientManifest,manifest:signedRecipientManifest}).strict();
function existing(db:DatabaseSync,account:{id:string;clientId:string}){
 const row=secureTaxEnrollment(db,account.id);if(!row)throw new SecureTaxError(409,"Renewal requires an existing encrypted enrollment.");
 const manifest=verifyRecipientManifestDocument(JSON.parse(row.manifest),account);
 if(row.clientId!==account.clientId||row.workspaceId!==manifest.workspaceId||row.manifestId!==manifest.manifestId||row.epoch!==manifest.epoch||row.clientRecipientId!==manifest.client.keyId||row.firmRecipientId!==manifest.firmRecovery.keyId)throw new SecureTaxError(409,"The existing enrollment binding needs review.");return manifest;
}
function staffAccount(db:DatabaseSync,token:string,accountId:string){const {user}=secureStaffIdentity(db,token);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can publish a firm-approved enrollment renewal.");const account=activeSecureAccount(db,accountId);if(!account)throw new SecureTaxError(404,"The encrypted account is unavailable.");return {user,account};}
function renew(db:DatabaseSync,account:{id:string;clientId:string},actor:string,raw:unknown){
 const packet=packetSchema.parse(raw),previous=verifyRecipientManifestDocument(packet.previous,account),manifest=verifyRecipientManifest(packet.manifest,account),current=existing(db,account);
 if(manifest.epoch<=previous.epoch||manifest.workspaceId!==previous.workspaceId||['client','firmRecovery'].some(role=>{const key=role as 'client'|'firmRecovery';return manifest[key].keyId!==previous[key].keyId||manifest[key].publicKey!==previous[key].publicKey;}))throw new SecureTaxError(409,"Renewal must keep both encryption keys and advance the signed epoch.");
 const duplicate=canonicalManifest(current)===canonicalManifest(manifest);
 if(!duplicate&&canonicalManifest(current)!==canonicalManifest(previous))throw new SecureTaxError(409,"The enrollment changed. Prepare renewal from its latest signed version.");
 const result=enrollSecureTaxAccount(db,account,manifest);
 if(!duplicate){
  if(privateAccountTable(db,"secure_tax_password_recovery"))db.prepare("UPDATE secure_tax_password_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
  if(privateAccountTable(db,"secure_tax_authenticator_recovery"))db.prepare("UPDATE secure_tax_authenticator_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
  db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(account.id,actor,"secure-tax.enrollment.renewed",new Date().toISOString(),JSON.stringify({previousEpoch:previous.epoch,epoch:manifest.epoch}));
 }
 return {...result,renewed:true,duplicate,renewalRequired:false,staffSharingRefreshRequired:true};
}
export function clientRenewalRequest(token:string|undefined){return workspaceDatabase(db=>({version:1,type:"shuug-enrollment-renewal-request",manifest:existing(db,secureAccount(db,token))}));}
export function clientRenewEnrollment(token:string|undefined,raw:unknown){return workspaceDatabase(db=>{const account=secureAccount(db,token);return renew(db,account,account.id,raw);},true);}
export function staffRenewalRequest(token:string,rawId:unknown){const id=secureTaxId.parse(rawId);return workspaceDatabase(db=>{const {account}=staffAccount(db,token,id);return {version:1,type:"shuug-enrollment-renewal-request",manifest:existing(db,account)};});}
export function staffRenewEnrollment(token:string,raw:unknown){const packet=packetSchema.parse(raw);return workspaceDatabase(db=>{const {user,account}=staffAccount(db,token,packet.manifest.accountId);return renew(db,account,user.id,packet);},true);}
