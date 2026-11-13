import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {hashPassword,verifyPassword} from "../auth/passwords";
import {secureStaffIdentity} from "./staff-session";
import {SecureTaxError} from "./manifest";
import {accountCode,privateAccountPassword,privateTaxAccount,privateTaxSession,privateAccountTable,privateTokenHash} from "./private-accounts";

/** Internal transaction primitive; callers establish account or owner authority. */
export function revokeSessions(db:DatabaseSync,id:string){
  db.prepare("DELETE FROM secure_tax_sessions WHERE accountId=?").run(id);
  if(privateAccountTable(db,"mfa_challenges"))db.prepare("DELETE FROM mfa_challenges WHERE kind='secure-customer' AND id=?").run(id);
  if(privateAccountTable(db,"mfa_session_grants"))db.prepare("DELETE FROM mfa_session_grants WHERE kind='secure-customer' AND account_id=?").run(id);
}
function audit(db:DatabaseSync,id:string,actor:string,action:string){db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(id,actor,action,new Date().toISOString(),"{}");}
export function setPrivateAccountAccess(staffToken:string,raw:unknown){
  const input=z.object({accountCode,enabled:z.boolean()}).strict().parse(raw);
  return workspaceDatabase(db=>{
    const {user}=secureStaffIdentity(db,staffToken);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can change private account access.");
    const account=privateTaxAccount(db,input.accountCode);if(!account)throw new SecureTaxError(404,"Private account unavailable.");
    db.prepare("UPDATE secure_tax_accounts SET status=? WHERE id=?").run(input.enabled?"active":"disabled",account.id);
    // Re-enabling never revives a previously issued session or pending login.
    revokeSessions(db,account.id);
    if(privateAccountTable(db,"secure_tax_password_recovery"))db.prepare("UPDATE secure_tax_password_recovery SET status='revoked' WHERE accountId=? AND status='pending'").run(account.id);
    audit(db,account.id,user.id,input.enabled?"secure-tax.account.enabled":"secure-tax.account.disabled");
    return {accountCode:account.id,enabled:input.enabled,sessionsRevoked:true};
  },true);
}
export function revokePrivateAccountSessions(token:string|undefined){
  return workspaceDatabase(db=>{const account=privateTaxSession(db,token);if(!account)throw new SecureTaxError(401,"Sign in to your private account again.");revokeSessions(db,account.id);audit(db,account.id,account.id,"secure-tax.sessions.revoked");return {sessionsRevoked:true};},true);
}
export function changePrivateAccountPassword(token:string|undefined,raw:unknown){
  const input=z.object({currentPassword:z.string().min(1).max(200),newPassword:privateAccountPassword}).strict().parse(raw);
  const result=workspaceDatabase(db=>{
    const account=privateTaxSession(db,token);if(!account)throw new SecureTaxError(401,"Sign in to your private account again.");
    const bucket=`password:${privateTokenHash(account.id)}`,now=Date.now();db.prepare("DELETE FROM secure_tax_login_attempts WHERE expires<=?").run(now);
    const attempts=db.prepare("SELECT count FROM secure_tax_login_attempts WHERE bucket=?").get(bucket) as {count:number}|undefined;
    if((attempts?.count??0)>=8)return {error:true} as const;
    db.prepare("INSERT INTO secure_tax_login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(bucket,now+900000);
    if(!verifyPassword(input.currentPassword,account.passwordHash!)||input.currentPassword===input.newPassword)return {error:true} as const;
    db.prepare("UPDATE secure_tax_accounts SET passwordHash=? WHERE id=?").run(hashPassword(input.newPassword),account.id);
    db.prepare("DELETE FROM secure_tax_login_attempts WHERE bucket=?").run(bucket);revokeSessions(db,account.id);audit(db,account.id,account.id,"secure-tax.password.changed");
    return {passwordChanged:true,sessionsRevoked:true} as const;
  },true);
  if("error" in result)throw new SecureTaxError(400,"Password change failed. Check the current password, choose a different new password, or wait before retrying.");return result;
}
