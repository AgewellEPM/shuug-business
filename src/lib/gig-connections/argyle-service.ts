import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { setting } from "../connections/vault";
import { assertPlaintextTaxAllowed, secureTaxRequired } from "../secure-tax/policy";
import { ArgyleError, argyleConfiguration, argyleList, argyleRequest, requireArgyle, sourceAccount, sourceItem, sourceRecord, resourceKinds, providerId } from "./argyle-provider";
import { cloudUser, scopedArgyle, currentCloudUser, initArgyle, enqueueCloud, claimCloudJob, retryCloudJob, saveCloudSnapshot, cloudRows, markCloudAccountsStopped, type CloudWindow } from "./argyle-store";
const externalId = (id:string) => `gigtax-${createHash("sha256").update(id).digest("hex")}`;

/** Owner-invoked recovery after an uncertain create; never create a duplicate user. */
export async function recoverArgyleUsers() {
  const c=requireArgyle();
  const pending=workspaceDatabase(db=>{initArgyle(db);return db.prepare("SELECT * FROM gig_cloud_users WHERE fingerprint=? AND status IN ('attention','creating') AND leaseUntil<? LIMIT 100").all(c.fingerprint,Date.now()) as unknown as ReturnType<typeof cloudUser>[];});
  let reconciled=0,needsReview=0;
  for(const saved of pending) {
    if(!saved)continue;
    const matches=await argyleList("users",z.object({id:providerId,external_id:z.string().nullable()}),{external_id:externalId(saved.accountId)},100);
    if(matches.length!==1||matches[0].external_id!==externalId(saved.accountId)) {needsReview++;continue;}
    workspaceDatabase(db=>{
      const current=cloudUser(db,saved.accountId);
      if(!current||current.generation!==saved.generation||!["attention","creating"].includes(current.status)||current.leaseUntil>Date.now()) throw new ArgyleError(409,"The client connection changed during recovery.");
      db.prepare("UPDATE gig_cloud_users SET providerUser=?,status='active',lastError=NULL,leaseId=NULL,leaseUntil=0 WHERE accountId=?").run(matches[0].id,saved.accountId);
      currentCloudUser(db,saved.accountId,saved.generation);
    },true);
    reconciled++;
  }
  return {reconciled,needsReview};
}

export async function createArgyleLink(token:string) {
  const config=requireArgyle(), leaseId=randomUUID();
  const user=workspaceDatabase(db=>{
    const {account,link}=scopedArgyle(db,token); assertPlaintextTaxAllowed({accountId:account.id,clientId:account.clientId},db);
    if (link && link.status!=="disconnected" && link.fingerprint!==config.fingerprint) throw new ArgyleError(409,"The provider application changed. Ask your firm to review the existing connection.");
    if (link && ["attention","creating","disconnecting"].includes(link.status)) throw new ArgyleError(409,"An earlier account setup needs review before starting another connection.");
    if (link?.status==="disconnected") db.prepare("UPDATE gig_cloud_users SET providerUser=NULL,fingerprint=?,environment=?,generation=?,status='creating',lastError=NULL,leaseId=?,leaseUntil=? WHERE accountId=?")
      .run(config.fingerprint,config.environment,randomUUID(),leaseId,Date.now()+120_000,account.id);
    if (!link) db.prepare("INSERT INTO gig_cloud_users(accountId,clientId,fingerprint,environment,generation,status,leaseId,leaseUntil) VALUES(?,?,?,?,?,'creating',?,?)")
      .run(account.id,account.clientId,config.fingerprint,config.environment,randomUUID(),leaseId,Date.now()+120_000);
    return cloudUser(db,account.id)!;
  },true);
  if (!user.providerUser) {
    try {
      const created=await argyleRequest("users",z.object({id:providerId,user_token:z.string().min(1).max(20000)}),{external_id:externalId(user.accountId)});
      workspaceDatabase(db=>{
        const {account}=scopedArgyle(db,token), current=currentCloudUser(db,account.id,user.generation);
        if(current.leaseId!==leaseId) throw new ArgyleError(409,"The account setup changed.");
        db.prepare("UPDATE gig_cloud_users SET providerUser=?,status='active',leaseId=NULL,leaseUntil=0 WHERE accountId=?").run(created.id,user.accountId);
      },true);
      return {userToken:created.user_token,sandbox:config.environment==="sandbox",expiresIn:3600};
    } catch(error) {
      workspaceDatabase(db=>db.prepare("UPDATE gig_cloud_users SET status='attention',leaseId=NULL,lastError=? WHERE accountId=? AND leaseId=?")
        .run("Account creation was not confirmed. The firm must reconcile it before retrying.",user.accountId,leaseId),true);
      throw error;
    }
  }
  const result=await argyleRequest("user-tokens",z.object({user_token:z.string().min(1).max(20000)}),{user:user.providerUser});
  workspaceDatabase(db=>{scopedArgyle(db,token);currentCloudUser(db,user.accountId,user.generation);});
  return {userToken:result.user_token,sandbox:config.environment==="sandbox",expiresIn:3600};
}
export function queueArgyleSync(token:string) {
  return workspaceDatabase(db=>{
    const {account}=scopedArgyle(db,token), user=currentCloudUser(db,account.id);
    if(!user.providerUser) throw new ArgyleError(409,"Connect a gig account first.");
    enqueueCloud(db,user); return {queued:true};
  },true);
}
const eventSchema=z.object({event:z.string().regex(/^(accounts|gigs|shifts|ratings|vehicles)\.(added|updated|removed|connected|failed|fully_synced|partially_synced)$/),
  data:z.object({user:providerId,account:providerId.optional()}).passthrough()});
export function acceptArgyleWebhook(raw:Buffer, signature:string|null) {
  const config=requireArgyle();
  const expected=createHmac("sha512",config.webhookSecret).update(raw).digest();
  const received=signature && /^[a-fA-F0-9]{128}$/.test(signature) ? Buffer.from(signature,"hex") : Buffer.alloc(0);
  if(received.length!==expected.length || !timingSafeEqual(received,expected)) throw new ArgyleError(401,"Webhook signature is invalid.");
  let input:unknown; try {input=JSON.parse(raw.toString("utf8"));} catch {throw new ArgyleError(400,"Invalid webhook.");}
  const event=eventSchema.safeParse(input);
  if(!event.success) return {accepted:true,queued:false};
  return workspaceDatabase(db=>{
    initArgyle(db);
    const row=db.prepare("SELECT accountId FROM gig_cloud_users WHERE providerUser=? AND fingerprint=? AND status='active'").get(event.data.data.user,config.fingerprint) as {accountId:string}|undefined;
    if(!row) return {accepted:true,queued:false};
    const user=currentCloudUser(db,row.accountId);
    // Payloads trigger authenticated retrieval, never direct financial mutations.
    enqueueCloud(db,user); return {accepted:true,queued:true};
  },true);
}
export async function runArgyleWorkerOnce() {
  workspaceDatabase(db=>{initArgyle(db);db.prepare("INSERT INTO gig_cloud_worker VALUES(1,?) ON CONFLICT(id) DO UPDATE SET lastSeenAt=excluded.lastSeenAt").run(new Date().toISOString());},true);
  const config=argyleConfiguration(); if(!config.ready) return {configured:false,processed:0};
  workspaceDatabase(db=>{
    initArgyle(db);
    const rows=db.prepare("SELECT accountId FROM gig_cloud_users WHERE status='active' AND fingerprint=? AND (lastSyncAt IS NULL OR lastSyncAt<?) LIMIT 100")
      .all(config.fingerprint,new Date(Date.now()-300_000).toISOString()) as unknown as {accountId:string}[];
    for(const row of rows) {
      if(db.prepare("SELECT 1 FROM gig_cloud_jobs WHERE accountId=?").get(row.accountId)) continue;
      try {enqueueCloud(db,currentCloudUser(db,row.accountId));} catch {}
    }
  },true);
  const job=claimCloudJob(); if(!job) return {configured:true,processed:0};
  try {
    const user=workspaceDatabase(db=>currentCloudUser(db,job.accountId,job.generation));
    if(!user.providerUser) throw new ArgyleError(409,"Account setup is incomplete.");
    const deadline=Date.now()+480_000;
    const accounts=await argyleList("accounts",sourceAccount,{user:user.providerUser},100,deadline);
    const accountDetails: {account:z.infer<typeof sourceAccount>;item:z.infer<typeof sourceItem>}[]=[], records:{kind:typeof resourceKinds[number];record:z.infer<typeof sourceRecord>}[]=[];
    const windows:CloudWindow[]=[];
    for(const account of accounts) {
      workspaceDatabase(db=>currentCloudUser(db,job.accountId,job.generation));
      if(account.user!==user.providerUser) throw new ArgyleError(502,"The provider returned a different user's account.");
      const item=await argyleRequest(`items/${account.item}`,sourceItem);
      accountDetails.push({account,item});
      for(const kind of resourceKinds) {
        if(Date.now()>deadline) throw new ArgyleError(503,"The account update took too long. Saved records are kept for the retry.");
        const coverage=item.features?.field_coverage?.[kind];
        // At least one explicitly supported field is required; false-only coverage is unsupported.
        const supported=(value:unknown):boolean=>Boolean(value&&typeof value==="object"&&("supported" in value ? value.supported===true : Object.values(value).some(supported)));
        if(!supported(coverage)) continue;
        const filters:Record<string,string>={account:account.id};
        if(kind==="gigs" || kind==="shifts") filters.from_start_datetime=new Date(Date.now()-Math.max(1,Math.min(366,Number(setting("ARGYLE_LOOKBACK_DAYS"))||366))*86400_000).toISOString();
        for(const record of await argyleList(kind,sourceRecord,filters,30_000,deadline)) {
          if(record.account!==account.id) throw new ArgyleError(502,"The provider returned records from another account.");
          records.push({kind,record});
        }
        windows.push({account:account.id,kind,from:filters.from_start_datetime});
      }
    }
    saveCloudSnapshot(job,accountDetails,records,windows);
    return {configured:true,processed:1,records:records.length};
  } catch(error) {
    retryCloudJob(job,error instanceof ArgyleError ? error.message : "The account update needs attention. Saved records are kept.");
    return {configured:true,processed:1,failed:true};
  }
}
export function argyleSummary(token:string) {
  return workspaceDatabase(db=>{
    const {account,link}=scopedArgyle(db,token), c=argyleConfiguration(), secure=secureTaxRequired({accountId:account.id,clientId:account.clientId},db);
    const data=link && !secure && link.fingerprint===c.fingerprint ? cloudRows(db,link) : {accounts:[],records:[]};
    const records=data.records.map(({kind,record,receivedAt,observedAt,sourceUpdatedAt,removedAt})=>({kind,id:record.id,providerAccount:record.account,platform:record.employer??null,status:record.status??null,removedAt,
      startedAt:record.start_datetime??null,endedAt:record.end_datetime??null,sourceUpdatedAt,receivedAt,observedAt,
      type:record.type??null,earningType:record.earning_type??null,durationSeconds:record.duration==null?null:String(record.duration),
      startLocation:record.start_location??null,endLocation:record.end_location??null,
      rating:record.rating==null?null:String(record.rating),acceptanceRate:record.acceptance_rate==null?null:String(record.acceptance_rate),ontimeRate:record.ontime_rate==null?null:String(record.ontime_rate),
      vehicle:kind==="vehicles"?{make:record.make??null,model:record.model??null,year:record.year==null?null:String(record.year)}:null,
      sourceAgeSeconds:sourceUpdatedAt ? Math.max(0,Math.round((Date.now()-Date.parse(sourceUpdatedAt))/1000)) : null,
      deliveryDelaySeconds:sourceUpdatedAt && Date.parse(sourceUpdatedAt)<=Date.parse(observedAt) ? Math.round((Date.parse(observedAt)-Date.parse(sourceUpdatedAt))/1000) : null,
      requestToReceiptSeconds:record.all_datetimes?.request_at && Date.parse(record.all_datetimes.request_at)<=Date.parse(observedAt) ? Math.round((Date.parse(observedAt)-Date.parse(record.all_datetimes.request_at))/1000) : null,
      income:record.income?Object.fromEntries(Object.entries(record.income).map(([key,value])=>[key,value==null?null:String(value)])):null,distance:record.distance==null?null:String(record.distance),distanceUnit:record.distance_unit??null,
      requestAt:record.all_datetimes?.request_at??null,acceptedAt:record.all_datetimes?.accept_at??null,pickupAt:record.all_datetimes?.pickup_at??null,dropoffAt:record.all_datetimes?.dropoff_at??null}));
    return {ready:c.ready&&!secure,canDisconnect:Boolean(link?.providerUser&&link.fingerprint===c.fingerprint&&link.status!=="disconnected"),environment:c.environment,status:secure?"protected":!c.enabled?"paused":link?.fingerprint===c.fingerprint?link.status:"not_connected",
      connected:Boolean(c.ready&&!secure&&link?.status==="active"&&data.accounts.some(a=>a.account.connection?.status==="connected")),lastSyncAt:link?.lastSyncAt??null,
      lastError:link?.lastError??null,incomingOfferFeed:false,
      availability:secure?"This client requires an off-host encrypted connector. Host-side provider access is disabled.":!c.ready?"The firm needs to configure its Argyle account.":"Connect your gig accounts to receive the records each provider makes available.",
      accounts:data.accounts.map(row=>({id:row.id,name:row.item.name,status:row.account.connection?.status??"unknown",refreshFrequency:row.item.features?.data_retrieval?.refresh_frequency??null,limitations:row.item.known_limitations??null,observedAt:row.observedAt})),records,
      accountingNote:"Connected work records are source evidence. They are not added again to entered trip income, bank deposits or tax totals.",
      liveOfferNote:"A connected account does not establish an incoming-offer feed. Update speed and field coverage must be verified for each platform."};
  });
}
export async function disconnectArgyle(token:string) {
  const row=workspaceDatabase(db=>{
    const {account,link:user}=scopedArgyle(db,token);
    if(!user||user.status==="disconnected") return user;
    if(!user.providerUser) throw new ArgyleError(409,"The firm must reconcile the unconfirmed provider user before revoking this connection.");
    if(user.fingerprint!==argyleConfiguration().fingerprint) throw new ArgyleError(409,"Restore the original provider application before revoking its connection.");
    db.prepare("UPDATE gig_cloud_users SET status='disconnecting',generation=? WHERE accountId=?").run(randomUUID(),account.id);
    markCloudAccountsStopped(db,account.id);
    db.prepare("DELETE FROM gig_cloud_jobs WHERE accountId=?").run(account.id);return user;
  },true);
  if(!row||row.status==="disconnected") return {disconnected:true,retainedHistory:true};
  try {
    if(row.providerUser) {
      try {await argyleRequest(`users/${row.providerUser}`,z.null(),undefined,"DELETE");}
      catch(error) {if(!(error instanceof ArgyleError&&error.status===404)) throw error;}
    }
    workspaceDatabase(db=>db.prepare("UPDATE gig_cloud_users SET status='disconnected',lastError=NULL WHERE accountId=? AND status='disconnecting'").run(row.accountId),true);
  } catch(error) {
    workspaceDatabase(db=>db.prepare("UPDATE gig_cloud_users SET lastError=? WHERE accountId=?").run("Local updates stopped. Provider revocation still needs a retry by the firm.",row.accountId),true);throw error;
  }
  return {disconnected:true,retainedHistory:true};
}
