import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {hashPassword,verifyPassword} from "../auth/passwords";
import {beginLoginFactor,mfaSessionVerified} from "../auth/mfa/store";
import {MfaChallengeError} from "../auth/mfa/model";
import {SecureTaxError,trustedPublicPins} from "./manifest";

export const accountCode=z.uuid();
export const privateAccountPassword=z.string().min(14).max(200);
export const privateTokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const privateAccountTable=(db:DatabaseSync,name:string)=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name);
export type PrivateTaxAccount={id:string;clientId:string;status:string;passwordHash:string|null;createdAt:string;lastLogin:string|null};
export function initPrivateAccounts(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS secure_tax_accounts(id TEXT PRIMARY KEY,clientId TEXT NOT NULL UNIQUE,status TEXT NOT NULL,passwordHash TEXT,createdAt TEXT NOT NULL,lastLogin TEXT);
    CREATE TABLE IF NOT EXISTS secure_tax_sessions(tokenHash TEXT PRIMARY KEY,accountId TEXT NOT NULL REFERENCES secure_tax_accounts(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_invitations(id TEXT PRIMARY KEY,accountId TEXT NOT NULL UNIQUE,clientId TEXT NOT NULL UNIQUE,tokenHash TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_login_attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS secure_tax_activation_challenges(id TEXT PRIMARY KEY,invitationId TEXT NOT NULL,manifestDigest TEXT NOT NULL,answerDigest TEXT NOT NULL,expires INTEGER NOT NULL);`);
}
export function privateTaxAccount(db:DatabaseSync,id:string){
  return privateAccountTable(db,"secure_tax_accounts")?db.prepare("SELECT * FROM secure_tax_accounts WHERE id=?").get(id) as PrivateTaxAccount|undefined:undefined;
}
export function privateTaxSession(db:DatabaseSync,token:string|undefined){
  if(!token||!/^[a-f0-9]{64}$/.test(token)||!privateAccountTable(db,"secure_tax_sessions"))return null;
  const digest=privateTokenHash(token),row=db.prepare("SELECT a.* FROM secure_tax_sessions s JOIN secure_tax_accounts a ON a.id=s.accountId WHERE s.tokenHash=? AND s.expires>? AND a.status='active'").get(digest,Date.now()) as PrivateTaxAccount|undefined;
  return row&&mfaSessionVerified(db,{kind:"secure-customer",id:row.id},digest)?row:null;
}
function permit(db:DatabaseSync,bucket:string,max:number){
  const now=Date.now();db.prepare("DELETE FROM secure_tax_login_attempts WHERE expires<=?").run(now);
  const row=db.prepare("SELECT count FROM secure_tax_login_attempts WHERE bucket=?").get(bucket) as {count:number}|undefined;
  if((row?.count??0)>=max)return false;
  db.prepare("INSERT INTO secure_tax_login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(bucket,now+900000);return true;
}
const dummy=hashPassword("synthetic-no-private-account-found");
export function signInPrivateTaxAccount(code:string,password:string):never{
  const input=accountCode.parse(code),result=workspaceDatabase(db=>{
    initPrivateAccounts(db);if(!permit(db,"all",300)||!permit(db,`login:${privateTokenHash(input)}`,8))return null;
    const row=privateTaxAccount(db,input),valid=verifyPassword(password.length<=200?password:"",row?.passwordHash??dummy);
    if(!valid||!row||row.status!=="active"||!row.passwordHash)return null;
    return beginLoginFactor(db,{kind:"secure-customer",id:row.id},row.passwordHash,true);
  },true);
  if(!result)throw new SecureTaxError(401,"Sign-in failed. Check your private account code and password, or try again later.");
  throw new MfaChallengeError(result);
}
export function signOutPrivateTaxAccount(token:string|undefined){if(token)workspaceDatabase(db=>{if(privateAccountTable(db,"secure_tax_sessions"))db.prepare("DELETE FROM secure_tax_sessions WHERE tokenHash=?").run(privateTokenHash(token));},true);}
export function newPrivateInvitation(db:DatabaseSync){
  initPrivateAccounts(db);const pins=trustedPublicPins(),now=Date.now();
  db.prepare("UPDATE secure_tax_invitations SET status='expired' WHERE status='pending' AND expires<=?").run(now);
  if(Number((db.prepare("SELECT count(*) AS n FROM secure_tax_invitations WHERE status='pending'").get() as {n:number}).n)>=1000)throw new SecureTaxError(413,"Pending invitation capacity needs review.");
  const id=randomUUID(),accountId=randomUUID(),clientId=randomUUID(),token=randomBytes(32).toString("hex"),expires=now+48*3600000;
  db.prepare("INSERT INTO secure_tax_invitations VALUES(?,?,?,?,?,'pending',?)").run(id,accountId,clientId,privateTokenHash(token),expires,new Date(now).toISOString());
  return {version:1,type:"shuug-private-account-invitation",invitationId:id,workspaceId:pins.workspaceId,accountId,clientId,token,expiresAt:new Date(expires).toISOString()};
}
export function privateInvitation(db:DatabaseSync,token:string){
  initPrivateAccounts(db);if(!/^[a-f0-9]{64}$/.test(token))throw new SecureTaxError(400,"Invalid private invitation.");
  const row=db.prepare("SELECT id,accountId,clientId FROM secure_tax_invitations WHERE tokenHash=? AND status='pending' AND expires>?").get(privateTokenHash(token),Date.now()) as {id:string;accountId:string;clientId:string}|undefined;
  if(!row)throw new SecureTaxError(409,"The private invitation expired, was revoked or was already used.");return row;
}
