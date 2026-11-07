import { createHash, randomBytes } from "node:crypto";
import { appBaseUrl, openSecret, sealSecret } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { customerCookie } from "../customer-access/accounts";
import { boundedBytes, driverToken, privateHeaders, driverFailure } from "../rideshare-driver/http";
import { ArgyleError } from "./argyle-provider";
import { scopedArgyle, initArgyle } from "./argyle-store";

export const argylePath="/api/website/customer/connections/argyle";
export function argyleCaller(request:Request,write=false) {
  const origin=request.headers.get("origin"), bearer=request.headers.get("authorization")?.startsWith("Bearer ");
  if((origin&&origin!==new URL(appBaseUrl()).origin)||(write&&!origin&&!bearer)) throw new ArgyleError(403,"Return to your own client account to manage this connection.");
  const token=driverToken(request,true);workspaceDatabase(db=>scopedArgyle(db,token));return token!;
}
export async function argyleInput(request:Request) {
  const bytes=await boundedBytes(request,8000), type=request.headers.get("content-type")?.split(";")[0].trim();
  if(type==="application/x-www-form-urlencoded") return Object.fromEntries(new URLSearchParams(bytes.toString("utf8")));
  if(type!=="application/json") throw new ArgyleError(415,"Use the connection form.");
  try {return JSON.parse(bytes.toString("utf8"));} catch {throw new ArgyleError(400,"Check the requested connection action.");}
}
export const argyleFailure=driverFailure;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function createArgyleHandoff(token:string) {
  const code=randomBytes(32).toString("hex");
  workspaceDatabase(db=>{
    const {account}=scopedArgyle(db,token);
    db.prepare("DELETE FROM gig_cloud_handoffs WHERE expires<=? OR accountId=?").run(Date.now(),account.id);
    db.prepare("INSERT INTO gig_cloud_handoffs VALUES(?,?,?,?)").run(hash(code),account.id,sealSecret(token),Date.now()+300_000);
  },true);
  return {url:`${appBaseUrl().replace(/\/$/,"")}${argylePath}/handoff?code=${code}`};
}
export function consumeArgyleHandoff(code:string) {
  if(!/^[a-f0-9]{64}$/.test(code)) throw new ArgyleError(400,"This connection link expired. Open it again from the app.");
  return workspaceDatabase(db=>{
    // Initialize and authenticate the original client session again before issuing its cookie.
    initArgyle(db);
    const row=db.prepare("SELECT * FROM gig_cloud_handoffs WHERE hash=? AND expires>?").get(hash(code),Date.now()) as {accountId:string;proof:string}|undefined;
    if(!row) throw new ArgyleError(400,"This connection link expired. Open it again from the app.");
    db.prepare("DELETE FROM gig_cloud_handoffs WHERE hash=?").run(hash(code));
    const token=openSecret(row.proof), scope=scopedArgyle(db,token);
    if(scope.account.id!==row.accountId) throw new ArgyleError(403,"This connection link belongs to a different client.");
    return new Response(null,{status:303,headers:{...privateHeaders,Location:argylePath,"Set-Cookie":customerCookie(token,appBaseUrl().startsWith("https:"))}});
  },true);
}
