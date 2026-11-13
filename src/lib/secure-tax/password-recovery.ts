import {randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {hashPassword} from "../auth/passwords";
import {driverAvailable} from "../rideshare-driver/policy";
import {secureStaffIdentity} from "./staff-session";
import {SecureTaxError,trustedPublicPins,verifyRecipientManifest} from "./manifest";
import {accountCode,privateAccountPassword,privateTaxAccount,privateTokenHash} from "./private-accounts";
import {secureTaxEnrollment} from "./store";
import {revokeSessions} from "./account-access";
import {assertPasswordRecoveryRequest,recoveryRequestMatchesManifest,verifyPasswordRecovery,canonicalPasswordRecovery} from "../../../packages/secure-tax-client/password-recovery.mjs";
import {sealPasswordRecoveryChallenge,passwordRecoveryAnswerDigest} from "../../../packages/secure-tax-client/password-recovery-proof.mjs";

const unavailable=():never=>{throw new SecureTaxError(409,"Password recovery is unavailable, expired, changed or already used. Ask the firm to review a fresh request.");};
function init(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_password_recovery(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,tokenHash TEXT NOT NULL UNIQUE,passwordBinding TEXT NOT NULL,request TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS secure_tax_password_proofs(id TEXT PRIMARY KEY,requestId TEXT NOT NULL,approvalDigest TEXT NOT NULL,answerDigest TEXT NOT NULL,expires INTEGER NOT NULL);`);}
function audit(db:DatabaseSync,id:string,actor:string,action:string){db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(id,actor,action,new Date().toISOString(),"{}");}
function owner(db:DatabaseSync,token:string){const {user}=secureStaffIdentity(db,token);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can request private account recovery.");return user;}
export function issuePasswordRecovery(staffToken:string,raw:unknown){
 const input=z.object({accountCode}).strict().parse(raw);
 return workspaceDatabase(db=>{const user=owner(db,staffToken);init(db);const account=privateTaxAccount(db,input.accountCode);if(!account||account.status!=="active")return unavailable();
  const enrolled=secureTaxEnrollment(db,account.id);if(!enrolled)return unavailable();const manifest=verifyRecipientManifest(JSON.parse(enrolled.manifest),account),now=Date.now(),expires=Math.min(now+24*3600000,Date.parse(manifest.expiresAt));
  const request={version:1,type:"shuug-password-recovery-request",requestId:randomUUID(),workspaceId:manifest.workspaceId,accountId:account.id,clientId:account.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,clientKeyId:manifest.client.keyId,issuedAt:new Date(now).toISOString(),expiresAt:new Date(expires).toISOString()};assertPasswordRecoveryRequest(request);
  const token=randomBytes(32).toString("hex");db.prepare("UPDATE secure_tax_password_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
  db.prepare("INSERT INTO secure_tax_password_recovery VALUES(?,?,?,?,?,?,'pending')").run(request.requestId,account.id,privateTokenHash(token),privateTokenHash(account.passwordHash!),JSON.stringify(request),expires);audit(db,account.id,user.id,"secure-tax.password-recovery.requested");
  return {version:1,type:"shuug-private-password-recovery",request,token,manifest};
 },true);
}
export function revokePasswordRecovery(staffToken:string,raw:unknown){const input=z.object({requestId:z.uuid()}).strict().parse(raw);return workspaceDatabase(db=>{const user=owner(db,staffToken);init(db);const changed=db.prepare("UPDATE secure_tax_password_recovery SET status='revoked' WHERE id=? AND status='pending'").run(input.requestId);db.prepare("DELETE FROM secure_tax_password_proofs WHERE requestId=?").run(input.requestId);audit(db,input.requestId,user.id,"secure-tax.password-recovery.revoked");return {revoked:Number(changed.changes)===1};},true);}
const challengeInput=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),approval:z.unknown()}).strict();
const completionInput=challengeInput.extend({challengeId:z.uuid(),answer:z.string().regex(/^[A-Za-z0-9_-]{43}$/),newPassword:privateAccountPassword}).strict();
async function approved(value:unknown){const pins=trustedPublicPins();try{return await verifyPasswordRecovery(value,{workspaceId:pins.workspaceId,signerPublicKey:pins.signerPublicKey});}catch{throw new SecureTaxError(403,"A current separate firm approval is required for this password recovery.");}}
function scope(db:DatabaseSync,token:string,approval:any){
 init(db);if(!driverAvailable(db))throw new SecureTaxError(404,"Encrypted client access is unavailable.");
 const row=db.prepare("SELECT * FROM secure_tax_password_recovery WHERE tokenHash=? AND status='pending' AND expires>?").get(privateTokenHash(token),Date.now()) as {id:string;accountId:string;passwordBinding:string;request:string}|undefined;if(!row)return unavailable();
 const account=privateTaxAccount(db,row.accountId);if(!account||account.status!=="active"||privateTokenHash(account.passwordHash!)!==row.passwordBinding)return unavailable();
 const request=JSON.parse(row.request);assertPasswordRecoveryRequest(request);for(const key of Object.keys(request))if(request[key]!==approval.request[key])return unavailable();
 const enrolled=secureTaxEnrollment(db,account.id);if(!enrolled)return unavailable();const manifest=verifyRecipientManifest(JSON.parse(enrolled.manifest),account);try{recoveryRequestMatchesManifest(request,manifest);}catch{return unavailable();}return {row,account,manifest};
}
export async function passwordRecoveryChallenge(raw:unknown){
 const input=challengeInput.parse(raw),approval=await approved(input.approval),selected=workspaceDatabase(db=>scope(db,input.token,approval),true),id=randomUUID(),expires=Math.min(Date.now()+5*60000,Date.parse(approval.expiresAt),Date.parse(selected.manifest.expiresAt));
 const sealed=await sealPasswordRecoveryChallenge(selected.manifest,{challengeId:id,expiresAt:new Date(expires).toISOString()});
 return workspaceDatabase(db=>{const current=scope(db,input.token,approval);if(current.row.id!==selected.row.id)return unavailable();db.prepare("DELETE FROM secure_tax_password_proofs WHERE expires<=?").run(Date.now());
  if((db.prepare("SELECT count(*) AS n FROM secure_tax_password_proofs WHERE requestId=?").get(current.row.id) as {n:number}).n>=3)throw new SecureTaxError(429,"Wait for the pending recovery proofs to expire before retrying.");
  db.prepare("INSERT INTO secure_tax_password_proofs VALUES(?,?,?,?,?)").run(id,current.row.id,privateTokenHash(canonicalPasswordRecovery(approval)),sealed.answerDigest,expires);return sealed.challenge;
 },true);
}
export async function completePasswordRecovery(raw:unknown){
 const input=completionInput.parse(raw),approval=await approved(input.approval),answer=await passwordRecoveryAnswerDigest(input.answer);
 const result=workspaceDatabase(db=>{const {row,account}=scope(db,input.token,approval),proof=db.prepare("SELECT * FROM secure_tax_password_proofs WHERE id=? AND requestId=? AND expires>?").get(input.challengeId,row.id,Date.now()) as {approvalDigest:string;answerDigest:string}|undefined;if(!proof)return unavailable();
  db.prepare("DELETE FROM secure_tax_password_proofs WHERE id=?").run(input.challengeId);if(proof.approvalDigest!==privateTokenHash(canonicalPasswordRecovery(approval))||!timingSafeEqual(Buffer.from(proof.answerDigest),Buffer.from(answer)))return {invalid:true} as const;
  db.prepare("UPDATE secure_tax_accounts SET passwordHash=? WHERE id=?").run(hashPassword(input.newPassword),account.id);revokeSessions(db,account.id);
  db.prepare("UPDATE secure_tax_password_recovery SET status='used' WHERE id=?").run(row.id);db.prepare("DELETE FROM secure_tax_password_proofs WHERE requestId=?").run(row.id);audit(db,account.id,account.id,"secure-tax.password.recovered");
  return {passwordChanged:true,sessionsRevoked:true,authenticatorPreserved:true,accountCode:account.id} as const;
 },true);if("invalid" in result)return unavailable();return result;
}
