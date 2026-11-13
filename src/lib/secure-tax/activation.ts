import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {workspaceDatabase} from "../workspace/database";
import {hashPassword} from "../auth/passwords";
import {driverAvailable} from "../rideshare-driver/policy";
import {secureStaffIdentity} from "./staff-session";
import {SecureTaxError,verifyRecipientManifest} from "./manifest";
import {canonicalManifest,signedRecipientManifest,secureTaxEnvelope} from "./envelope";
import {newPrivateInvitation,privateInvitation,privateTaxAccount,privateAccountPassword,initPrivateAccounts,privateAccountTable} from "./private-accounts";
import {enrollSecureTaxAccount,commitSecureTaxEnvelope} from "./store";
import {legacySecureTaxData} from "./legacy";
import {sealActivationChallenge,activationAnswerDigest} from "../../../packages/secure-tax-client/activation-proof.mjs";

const token=z.string().regex(/^[a-f0-9]{64}$/),challengeInput=z.object({token,manifest:signedRecipientManifest}).strict();
const activationInput=challengeInput.extend({challengeId:z.uuid(),answer:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:privateAccountPassword,
  profile:z.object({mutationId:z.uuid(),expectedRevision:z.literal(0),envelope:secureTaxEnvelope}).strict()}).strict();
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const unavailable=():never=>{throw new SecureTaxError(409,"Account activation could not be verified. Obtain a current invitation and signed manifest.");};
function available(){if(!driverAvailable())throw new SecureTaxError(404,"Encrypted client access is not enabled for this workspace.");}
export function issuePrivateTaxInvitation(staffToken:string){
  available();return workspaceDatabase(db=>{const {user}=secureStaffIdentity(db,staffToken);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can invite an encrypted client.");const invitation=newPrivateInvitation(db);
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(invitation.invitationId,user.id,"secure-tax.invitation.created",new Date().toISOString(),JSON.stringify({accountId:invitation.accountId,clientId:invitation.clientId}));return invitation;},true);
}
export function revokePrivateTaxInvitation(staffToken:string,raw:unknown){
  const input=z.object({invitationId:z.uuid()}).strict().parse(raw);return workspaceDatabase(db=>{const {user}=secureStaffIdentity(db,staffToken);if(!user.isOwner)throw new SecureTaxError(403,"Only the verified owner can revoke this invitation.");initPrivateAccounts(db);
    const changed=db.prepare("UPDATE secure_tax_invitations SET status='revoked' WHERE id=? AND status='pending'").run(input.invitationId);db.prepare("DELETE FROM secure_tax_activation_challenges WHERE invitationId=?").run(input.invitationId);return {revoked:Number(changed.changes)===1};},true);
}
export async function privateActivationChallenge(raw:unknown){
  available();const input=challengeInput.parse(raw),invitation=workspaceDatabase(db=>privateInvitation(db,input.token),true),manifest=verifyRecipientManifest(input.manifest,{id:invitation.accountId,clientId:invitation.clientId});
  const now=Date.now(),expires=Math.min(now+5*60000,Date.parse(manifest.expiresAt)),id=randomUUID(),sealed=await sealActivationChallenge(manifest,{challengeId:id,expiresAt:new Date(expires).toISOString()});
  return workspaceDatabase(db=>{const current=privateInvitation(db,input.token);if(current.id!==invitation.id)unavailable();db.prepare("DELETE FROM secure_tax_activation_challenges WHERE expires<=?").run(Date.now());
    const count=db.prepare("SELECT count(*) AS n FROM secure_tax_activation_challenges WHERE invitationId=?").get(invitation.id) as {n:number};if(count.n>=3)throw new SecureTaxError(429,"Wait for the pending activation proof to expire before retrying.");
    db.prepare("INSERT INTO secure_tax_activation_challenges VALUES(?,?,?,?,?)").run(id,invitation.id,digest(canonicalManifest(manifest)),sealed.answerDigest,expires);return sealed.challenge;},true);
}
export async function activatePrivateTaxAccount(raw:unknown){
  available();const input=activationInput.parse(raw),answerDigest=await activationAnswerDigest(input.answer);
  const result=workspaceDatabase(db=>{
    const invitation=privateInvitation(db,input.token),account={id:invitation.accountId,clientId:invitation.clientId},manifest=verifyRecipientManifest(input.manifest,account);
    const challenge=db.prepare("SELECT * FROM secure_tax_activation_challenges WHERE id=? AND invitationId=? AND expires>?").get(input.challengeId,invitation.id,Date.now()) as {manifestDigest:string;answerDigest:string}|undefined;
    if(!challenge)return unavailable();
    // Consume even incorrect proofs; guessing never rolls back the one-use fact.
    db.prepare("DELETE FROM secure_tax_activation_challenges WHERE id=?").run(input.challengeId);
    if(challenge.manifestDigest!==digest(canonicalManifest(manifest))||!timingSafeEqual(Buffer.from(challenge.answerDigest),Buffer.from(answerDigest)))return {invalid:true} as const;
    if(privateTaxAccount(db,account.id)||db.prepare("SELECT 1 FROM records WHERE id=?").get(account.clientId)||privateAccountTable(db,"customer_accounts")&&db.prepare("SELECT 1 FROM customer_accounts WHERE id=? OR clientId=?").get(account.id,account.clientId))unavailable();
    if(legacySecureTaxData(db,account).legacyMigrationRequired)throw new SecureTaxError(409,"Existing client data requires verified migration before activation.");
    const envelope=input.profile.envelope;if(envelope.context.domain!=="tax-identity"||envelope.context.accountId!==account.id||envelope.context.revision!==1||envelope.author.role!=="client"||!z.uuid().safeParse(envelope.context.objectId).success)throw new SecureTaxError(400,"Use the encrypted client profile prepared for this new account.");
    db.prepare("INSERT INTO secure_tax_accounts VALUES(?,?,'active',?,?,NULL)").run(account.id,account.clientId,hashPassword(input.password),new Date().toISOString());
    enrollSecureTaxAccount(db,account,manifest);commitSecureTaxEnvelope(db,account,manifest,envelope.context.objectId,input.profile);
    db.prepare("UPDATE secure_tax_invitations SET status='accepted' WHERE id=?").run(invitation.id);db.prepare("DELETE FROM secure_tax_activation_challenges WHERE invitationId=?").run(invitation.id);
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(account.id,account.id,"secure-tax.account.activated",new Date().toISOString(),JSON.stringify({clientId:account.clientId,manifestId:manifest.manifestId,epoch:manifest.epoch}));
    return {activated:true,identity:{accountId:account.id,clientId:account.clientId}} as const;
  },true);
  if("invalid" in result)unavailable();return result;
}
