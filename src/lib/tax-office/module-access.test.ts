// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { saveBusinessRecord } from "../workspace/store";
import { workspaceDatabase } from "../workspace/database";
import { moduleById } from "../sdk/registry";
import { addRecord, listRecords } from "../sdk/records";
import { withRequestIdentity } from "../auth/request-context";
import type { WorkspaceUser } from "../auth/identity";
import { businessHandlers } from "../backend/resources";
import { backendHandler } from "../backend/http";
import { moduleRecordsForUser } from "./module-access";
import { assertTaxClientAccess, taxClientsForUser } from "./access";
import { addRecordAction, archiveRecordAction, removeRecordAction, updateRecordAction } from "@/app/m/[id]/actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// These tests exercise the additional client boundary after section permission.
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));

const owner:WorkspaceUser={id:"workspace-owner",memberId:"owner",name:"Owner",email:"",role:"Owner",isOwner:true};
const staff:WorkspaceUser={id:randomUUID(),memberId:"synthetic-staff",name:"Staff",email:"staff@example.invalid",role:"Manager",isOwner:false};
const other={...staff,id:randomUUID(),memberId:"other-staff"};
const moduleId="tax-engagements";
let directory:string,alpha:{id:string;title:string},beta:typeof alpha;
let one:ReturnType<typeof addRecord>,two:typeof one;

function engagement(client:typeof alpha,accountant=owner.id) {
  return addRecord(moduleId,moduleById(moduleId)!.fields,{name:client.title,client_id:client.id,tax_year:2025,stage:"Awaiting documents",accountant});
}
function assign(record:typeof one,accountId:string) {
  workspaceDatabase(db=>db.prepare("INSERT INTO documents VALUES(?,'tax-workflow',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(`tax-workflow:${record.id}`,JSON.stringify({id:record.id,clientId:record.values.client_id,assignedAccountId:accountId})),true);
}
const as=<T>(user:WorkspaceUser,work:()=>T)=>withRequestIdentity(user,work);

beforeEach(()=>{
  directory=mkdtempSync(`${tmpdir()}/shuug-tax-module-access-`);
  vi.stubEnv("DEALDESK_DATA_DIR",directory);vi.stubEnv("DEMO_DATA","false");vi.stubEnv("DATABASE_URL","");
  alpha=saveBusinessRecord({kind:"client",title:"Synthetic alpha",fields:{email:"alpha@example.invalid"}},owner.id);
  beta=saveBusinessRecord({kind:"client",title:"Synthetic beta",fields:{email:"beta@example.invalid"}},owner.id);
  one=engagement(alpha,staff.id);two=engagement(beta,other.id);assign(one,staff.id);assign(two,other.id);
});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});

it("filters generic tracker and API reads by the current client assignment",async()=>{
  expect(moduleRecordsForUser(moduleId,staff).map(row=>row.id)).toEqual([one.id]);
  expect(taxClientsForUser([alpha,beta],staff)).toEqual([alpha]);
  const handler=businessHandlers()[`m/${moduleId}`];
  const staffData=await as(staff,()=>handler.load()) as {count:number;records:{id:string}[]};
  expect(staffData.count).toBe(1);expect(staffData.records.map(row=>row.id)).toEqual([one.id]);
  const ownerData=await as(owner,()=>handler.load()) as {count:number};expect(ownerData.count).toBe(2);
});

it("preserves the declared backend-token API without treating module names as owner authority",async()=>{
  const token="synthetic-backend-token";vi.stubEnv("BACKEND_ACCESS_TOKEN",token);
  const read=(resource:string)=>backendHandler(new Request("http://127.0.0.1:3000/api/backend",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({operation:"business_read",arguments:{resource}})}));
  expect((await read("features")).status).toBe(200);
  expect((await read(`m/${moduleId}`)).status).toBe(400);
  await expect(businessHandlers()[`m/${moduleId}`].load()).rejects.toThrow();
  const ownerData=await as(owner,()=>businessHandlers()[`m/${moduleId}`].load()) as {count:number};expect(ownerData.count).toBe(2);
});

it("denies generic add, update, archive and removal for another assigned client",async()=>{
  const attempt=async(work:()=>Promise<{ok:boolean}>)=>expect(await as(staff,work)).toMatchObject({ok:false});
  await attempt(()=>addRecordAction(moduleId,{...two.values,name:"Forbidden new row"}));
  await attempt(()=>updateRecordAction(moduleId,two.id,{...two.values,notes:"Forbidden edit"}));
  await attempt(()=>archiveRecordAction(moduleId,two.id,true));
  await attempt(()=>removeRecordAction(moduleId,two.id));
  expect(listRecords(moduleId)).toHaveLength(2);
  expect(listRecords(moduleId).find(row=>row.id===two.id)).toMatchObject({archived:false,values:two.values});
  expect(await as(staff,()=>updateRecordAction(moduleId,one.id,{...one.values,notes:"Assigned staff review"}))).toMatchObject({ok:true});
});

it("checks both clients when a generic edit tries to retarget a record",async()=>{
  expect(await as(staff,()=>updateRecordAction(moduleId,one.id,{...one.values,client_id:beta.id}))).toMatchObject({ok:false});
  expect(listRecords(moduleId).find(row=>row.id===one.id)?.values.client_id).toBe(alpha.id);
});

it("revokes assignment from archived work even when another engagement for that client is active",async()=>{
  expect(await as(owner,()=>archiveRecordAction(moduleId,one.id,true))).toMatchObject({ok:true});
  const replacement=engagement(alpha,other.id);assign(replacement,other.id);
  expect(moduleRecordsForUser(moduleId,staff)).toEqual([]);
  expect(()=>workspaceDatabase(db=>assertTaxClientAccess(db,alpha.id,staff))).toThrow(/not assigned/);
  expect(moduleRecordsForUser(moduleId,other).map(row=>row.id)).toContain(replacement.id);
  expect(moduleRecordsForUser(moduleId,owner).map(row=>row.id)).toContain(one.id);
});

it("does not treat an orphan or mismatched workflow assignment as a grant",()=>{
  assign(one,other.id);
  expect(()=>workspaceDatabase(db=>assertTaxClientAccess(db,alpha.id,other))).toThrow(/not assigned/);
  workspaceDatabase(db=>db.prepare("DELETE FROM documents WHERE id=?").run(`tax-workflow:${one.id}`),true);
  assign({...one,id:randomUUID()},staff.id);
  expect(moduleRecordsForUser(moduleId,staff)).toEqual([]);
});

it("honors view-only book grants and their immediate revocation",async()=>{
  const id=randomUUID(),writeGrant=(level?:"view"|"edit")=>workspaceDatabase(db=>db.prepare("INSERT INTO documents VALUES(?,'client-book',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(`client-book:${id}`,JSON.stringify({id,clientId:beta.id,grants:level?[{accountId:staff.id,level}]:[]})),true);
  writeGrant("view");expect(moduleRecordsForUser(moduleId,staff).map(row=>row.id)).toContain(two.id);
  expect(await as(staff,()=>updateRecordAction(moduleId,two.id,{...two.values,notes:"View-only write"}))).toMatchObject({ok:false});
  writeGrant("edit");expect(await as(staff,()=>updateRecordAction(moduleId,two.id,{...two.values,notes:"Granted edit"}))).toMatchObject({ok:true});
  writeGrant();expect(moduleRecordsForUser(moduleId,staff).map(row=>row.id)).not.toContain(two.id);
});

it("keeps enrolled client plaintext out of owner and staff generic surfaces",async()=>{
  workspaceDatabase(db=>{
    db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT,clientId TEXT,status TEXT)");
    db.prepare("INSERT INTO secure_tax_enrollments VALUES(?,?,'active')").run("synthetic-account",alpha.id);
  },true);
  expect(moduleRecordsForUser(moduleId,owner).map(row=>row.id)).not.toContain(one.id);
  expect(moduleRecordsForUser(moduleId,staff)).toEqual([]);
  expect(await as(owner,()=>archiveRecordAction(moduleId,one.id,true))).toMatchObject({ok:false});
  expect(await as(owner,()=>updateRecordAction(moduleId,one.id,{...one.values,notes:"Blocked plaintext"}))).toMatchObject({ok:false});
  expect(listRecords(moduleId).find(row=>row.id===one.id)).toMatchObject({archived:false,values:one.values});
});

it("fails closed for an existing malformed enrollment schema",async()=>{
  workspaceDatabase(db=>db.exec("CREATE TABLE secure_tax_enrollments(accountId TEXT)"),true);
  expect(moduleRecordsForUser(moduleId,owner)).toEqual([]);expect(moduleRecordsForUser(moduleId,staff)).toEqual([]);
  expect(await as(owner,()=>archiveRecordAction(moduleId,one.id,true))).toMatchObject({ok:false});
});
