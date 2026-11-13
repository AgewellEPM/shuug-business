import {randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {verifyPassword} from "../auth/passwords";
import {newTotpSecret,authenticatorUri,verifyTotp} from "../auth/mfa/crypto";
import {sealSecret,openSecret} from "../connections/vault";
import {driverAvailable} from "../rideshare-driver/policy";
import {secureStaffIdentity} from "./staff-session";
import {SecureTaxError,trustedPublicPins,verifyRecipientManifest} from "./manifest";
import {accountCode,privateTaxAccount,privateTokenHash,privateAccountTable} from "./private-accounts";
import {secureTaxEnrollment} from "./store";
import {revokeSessions} from "./account-access";
import {assertAuthenticatorRecoveryRequest,recoveryRequestMatchesManifest,verifyAuthenticatorRecovery,canonicalAuthenticatorRecovery} from "../../../packages/secure-tax-client/authenticator-recovery.mjs";
import {sealAuthenticatorRecoveryChallenge,authenticatorRecoveryAnswerDigest} from "../../../packages/secure-tax-client/authenticator-recovery-proof.mjs";

const unavailable=():never=>{throw new SecureTaxError(409,"Authenticator recovery is unavailable, changed, expired or used. Ask the firm to review a fresh request.");};
function init(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_authenticator_recovery(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,tokenHash TEXT NOT NULL UNIQUE,passwordBinding TEXT NOT NULL,request TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS secure_tax_authenticator_proofs(id TEXT PRIMARY KEY,requestId TEXT NOT NULL,approvalDigest TEXT NOT NULL,answerDigest TEXT NOT NULL,secret TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL);`);}
function factorRevision(db:DatabaseSync,id:string){if(!privateAccountTable(db,"mfa_factors"))return 0;return (db.prepare("SELECT revision FROM mfa_factors WHERE kind='secure-customer' AND account_id=?").get(id) as {revision:number}|undefined)?.revision??0;}
function audit(db:DatabaseSync,id:string,actor:string,action:string){db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(id,actor,action,new Date().toISOString(),"{}");}
function owner(db:DatabaseSync,token:string){const {user}=secureStaffIdentity(db,token);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can request private authenticator recovery.");return user;}
export function issueAuthenticatorRecovery(staffToken:string,raw:unknown){
 const input=z.object({accountCode}).strict().parse(raw);
 return workspaceDatabase(db=>{const user=owner(db,staffToken);init(db);const account=privateTaxAccount(db,input.accountCode);if(!account||account.status!=="active")return unavailable();
  const enrolled=secureTaxEnrollment(db,account.id);if(!enrolled)return unavailable();const manifest=verifyRecipientManifest(JSON.parse(enrolled.manifest),account),now=Date.now(),expires=Math.min(now+24*3600000,Date.parse(manifest.expiresAt)),revision=factorRevision(db,account.id);if(!revision)return unavailable();
  const request={version:1,type:"shuug-authenticator-recovery-request",requestId:randomUUID(),workspaceId:manifest.workspaceId,accountId:account.id,clientId:account.clientId,manifestId:manifest.manifestId,manifestEpoch:manifest.epoch,clientKeyId:manifest.client.keyId,factorRevision:revision,issuedAt:new Date(now).toISOString(),expiresAt:new Date(expires).toISOString()};assertAuthenticatorRecoveryRequest(request);
  const token=randomBytes(32).toString("hex");db.prepare("UPDATE secure_tax_authenticator_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
  db.prepare("INSERT INTO secure_tax_authenticator_recovery VALUES(?,?,?,?,?,?,'pending')").run(request.requestId,account.id,privateTokenHash(token),privateTokenHash(account.passwordHash!),JSON.stringify(request),expires);audit(db,account.id,user.id,"secure-tax.authenticator-recovery.requested");
  return {version:1,type:"shuug-private-authenticator-recovery",request,token,manifest};
 },true);
}
export function revokeAuthenticatorRecovery(staffToken:string,raw:unknown){const input=z.object({requestId:z.uuid()}).strict().parse(raw);return workspaceDatabase(db=>{const user=owner(db,staffToken);init(db);const changed=db.prepare("UPDATE secure_tax_authenticator_recovery SET status='revoked' WHERE id=? AND status='pending'").run(input.requestId);db.prepare("DELETE FROM secure_tax_authenticator_proofs WHERE requestId=?").run(input.requestId);audit(db,input.requestId,user.id,"secure-tax.authenticator-recovery.revoked");return {revoked:Number(changed.changes)===1};},true);}
const approvedInput=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),approval:z.unknown()}).strict();
const challengeInput=approvedInput.extend({password:z.string().min(1).max(200)}).strict();
const completionInput=approvedInput.extend({challengeId:z.uuid(),answer:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\d{6}$/)}).strict();
async function approved(value:unknown){const pins=trustedPublicPins();try{return await verifyAuthenticatorRecovery(value,{workspaceId:pins.workspaceId,signerPublicKey:pins.signerPublicKey});}catch{throw new SecureTaxError(403,"A current separate firm approval for authenticator replacement is required.");}}
function scope(db:DatabaseSync,token:string,approval:any){
 init(db);if(!driverAvailable(db))throw new SecureTaxError(404,"Encrypted client access is unavailable.");
 const row=db.prepare("SELECT * FROM secure_tax_authenticator_recovery WHERE tokenHash=? AND status='pending' AND expires>?").get(privateTokenHash(token),Date.now()) as {id:string;accountId:string;passwordBinding:string;request:string}|undefined;if(!row)return unavailable();
 const account=privateTaxAccount(db,row.accountId);if(!account||account.status!=="active"||privateTokenHash(account.passwordHash!)!==row.passwordBinding)return unavailable();
 const request=JSON.parse(row.request);assertAuthenticatorRecoveryRequest(request);for(const key of Object.keys(request))if(request[key]!==approval.request[key])return unavailable();if(request.factorRevision!==factorRevision(db,account.id))return unavailable();
 const enrolled=secureTaxEnrollment(db,account.id);if(!enrolled)return unavailable();const manifest=verifyRecipientManifest(JSON.parse(enrolled.manifest),account);try{recoveryRequestMatchesManifest(request,manifest);}catch{return unavailable();}return {row,account,manifest,request};
}
export async function authenticatorRecoveryChallenge(raw:unknown){
 const input=challengeInput.parse(raw),approval=await approved(input.approval);
 const selected=workspaceDatabase(db=>{const current=scope(db,input.token,approval),bucket=`authenticator:${privateTokenHash(current.account.id)}`,now=Date.now();db.prepare("DELETE FROM secure_tax_login_attempts WHERE expires<=?").run(now);
  const attempts=db.prepare("SELECT count FROM secure_tax_login_attempts WHERE bucket=?").get(bucket) as {count:number}|undefined;if((attempts?.count??0)>=8)return null;
  db.prepare("INSERT INTO secure_tax_login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(bucket,now+900000);
  if(!verifyPassword(input.password,current.account.passwordHash!))return null;db.prepare("DELETE FROM secure_tax_login_attempts WHERE bucket=?").run(bucket);return current;
 },true);if(!selected)throw new SecureTaxError(403,"Check the current account password or wait before retrying authenticator recovery.");
 const id=randomUUID(),expires=Math.min(Date.now()+5*60000,Date.parse(approval.expiresAt),Date.parse(selected.manifest.expiresAt)),secret=newTotpSecret(),sealed=await sealAuthenticatorRecoveryChallenge(selected.manifest,{challengeId:id,expiresAt:new Date(expires).toISOString()});
 return workspaceDatabase(db=>{const current=scope(db,input.token,approval);if(current.row.id!==selected.row.id)return unavailable();db.prepare("DELETE FROM secure_tax_authenticator_proofs WHERE expires<=?").run(Date.now());
  if((db.prepare("SELECT count(*) AS n FROM secure_tax_authenticator_proofs WHERE requestId=?").get(current.row.id) as {n:number}).n>=3)throw new SecureTaxError(429,"Wait for the pending authenticator proofs to expire before retrying.");
  db.prepare("INSERT INTO secure_tax_authenticator_proofs VALUES(?,?,?,?,?,?,0)").run(id,current.row.id,privateTokenHash(canonicalAuthenticatorRecovery(approval)),sealed.answerDigest,sealSecret(secret),expires);
  return {challenge:sealed.challenge,secret,authenticatorUri:authenticatorUri(secret,`secure-customer-${current.account.id}`)};
 },true);
}
export async function completeAuthenticatorRecovery(raw:unknown){
 const input=completionInput.parse(raw),approval=await approved(input.approval),answer=await authenticatorRecoveryAnswerDigest(input.answer);
 const result=workspaceDatabase(db=>{const {row,account,request}=scope(db,input.token,approval),proof=db.prepare("SELECT * FROM secure_tax_authenticator_proofs WHERE id=? AND requestId=? AND expires>?").get(input.challengeId,row.id,Date.now()) as {approvalDigest:string;answerDigest:string;secret:string;attempts:number}|undefined;if(!proof)return unavailable();
  if(proof.approvalDigest!==privateTokenHash(canonicalAuthenticatorRecovery(approval))||!timingSafeEqual(Buffer.from(proof.answerDigest),Buffer.from(answer))){db.prepare("DELETE FROM secure_tax_authenticator_proofs WHERE id=?").run(input.challengeId);return {invalid:true} as const;}
  const counter=verifyTotp(openSecret(proof.secret),input.code,Date.now(),-1);
  if(counter===null){if(proof.attempts>=4)db.prepare("DELETE FROM secure_tax_authenticator_proofs WHERE id=?").run(input.challengeId);else db.prepare("UPDATE secure_tax_authenticator_proofs SET attempts=attempts+1 WHERE id=?").run(input.challengeId);return {invalidCode:true} as const;}
  db.prepare("UPDATE mfa_factors SET secret=?,revision=revision+1,last_counter=? WHERE kind='secure-customer' AND account_id=? AND revision=?").run(proof.secret,counter,account.id,request.factorRevision);
  db.prepare("DELETE FROM mfa_recovery WHERE kind='secure-customer' AND account_id=?").run(account.id);const recoveryCodes:string[]=[];
  for(let i=0;i<10;i++){const code=randomBytes(12).toString("hex").toUpperCase();recoveryCodes.push(code.match(/.{6}/g)!.join("-"));db.prepare("INSERT INTO mfa_recovery VALUES('secure-customer',?,?)").run(account.id,privateTokenHash(code));}
  db.prepare("DELETE FROM mfa_attempts WHERE kind='secure-customer' AND account_id=?").run(account.id);revokeSessions(db,account.id);
  db.prepare("UPDATE secure_tax_authenticator_recovery SET status='used' WHERE id=?").run(row.id);db.prepare("DELETE FROM secure_tax_authenticator_proofs WHERE requestId=?").run(row.id);
  if(privateAccountTable(db,"secure_tax_password_recovery"))db.prepare("UPDATE secure_tax_password_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
  audit(db,account.id,account.id,"secure-tax.authenticator.replaced");return {authenticatorReplaced:true,sessionsRevoked:true,oldRecoveryCodesRevoked:true,accountCode:account.id,recoveryCodes} as const;
 },true);
 if("invalid" in result)return unavailable();if("invalidCode" in result)throw new SecureTaxError(400,"Enter a current code from the replacement authenticator. Five incorrect codes require a fresh setup.");return result;
}
