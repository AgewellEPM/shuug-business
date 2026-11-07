// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveBusinessRecord } from "../workspace/store";
import { saveClientBook, requireBook } from "./client-books";
import { bookCommand, bookView } from "./book-service";
import { manualJournalData } from "./journal-store";
import { createEmployeeAccount, acceptEmployeeInvitation, issueEmployeeInvitation } from "../auth/employees";
import type { WorkspaceUser } from "../auth/identity";
import { parseStatementCsv } from "./bank-import";
let dir:string;
const owner:WorkspaceUser={id:"workspace-owner",memberId:"owner",name:"Owner",email:"",role:"Owner",isOwner:true};
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"shuug-books-"));vi.stubEnv("DEALDESK_DATA_DIR",dir);vi.stubEnv("DEMO_DATA","false");});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
function create(name="Synthetic client") { const client=saveBusinessRecord({kind:"client",title:name,fields:{email:"synthetic@example.invalid"}},owner.id);return saveClientBook({clientId:client.id,name,revision:0,grants:[],reviewed:true},owner); }
const command=(id:string,action:string,input:object,user=owner)=>bookCommand(id,{requestId:randomUUID(),action,input:{...input,reviewed:true}},user);
it("completes a client month: capital, split expenses, revenue, matching, close and next-period correction",async()=>{
  const book=create();
  await command(book.id,"journal.post",{date:"2026-09-30",memo:"Opening capital",lines:[{accountNumber:1000,debitCents:100000,creditCents:0},{accountNumber:3000,debitCents:0,creditCents:100000}]});
  const opening=manualJournalData(book.id).entries[0].id;
  const request={requestId:randomUUID(),action:"statement.import",input:{accountNumber:1000,from:"2026-10-01",through:"2026-10-31",openingCents:100000,closingCents:119000,reference:"Synthetic October",openingEntryIds:[opening],csv:"date,description,amount,reference\n2026-10-10,Client payment,250.00,synthetic-deposit\n2026-10-12,Office costs,-60.00,synthetic-cost",reviewed:true}};
  const imported=await bookCommand(book.id,request,owner);expect(await bookCommand(book.id,request,owner)).toEqual(imported);
  let view=await bookView(book.id,owner),s=view.statements[0];
  await expect(command(book.id,"statement.finish",{id:s.id,revision:s.revision})).rejects.toThrow(/Match every/);
  await command(book.id,"statement.post",{id:s.id,revision:s.revision,rowId:"1",allocations:[{accountNumber:4000,amountCents:25000}]});
  s=(await bookView(book.id,owner)).statements[0];
  await command(book.id,"statement.post",{id:s.id,revision:s.revision,rowId:"2",allocations:[{accountNumber:6300,amountCents:4000},{accountNumber:6000,amountCents:2000}]});
  view=await bookView(book.id,owner);s=view.statements[0];expect(view.reports.pnl.netIncomeCents).toBe(19000);expect(view.reports.balanceSheet.assetsCents).toBe(119000);
  expect((await bookView("office",owner)).reports.pnl.netIncomeCents).toBe(0);
  await command(book.id,"statement.finish",{id:s.id,revision:s.revision});
  await command(book.id,"period.close",{through:"2026-10-31",reason:"Statement and supporting receipts reviewed"});
  await expect(command(book.id,"journal.post",{date:"2026-10-20",memo:"Backdate",lines:[{accountNumber:1000,debitCents:100,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:100}]})).rejects.toThrow(/closed through/);
  const deposit=manualJournalData(book.id).entries.find(e=>e.memo.includes("Client payment"))!;
  await command(book.id,"journal.reverse",{id:deposit.id,revision:1,date:"2026-11-02",reason:"Verified bank returned deposit"});
  expect((await bookView(book.id,owner)).reports.pnl.netIncomeCents).toBe(-6000);
  expect((await bookView(book.id,owner)).statements[0].closingCents).toBe(119000);
});
it("enforces client assignments, grant revocation and workspace isolation",async()=>{
  const one=create(),two=create("Other client"),account=createEmployeeAccount({memberId:"synthetic-staff",name:"Synthetic",email:"staff@example.invalid"});
  acceptEmployeeInvitation(issueEmployeeInvitation(account.id),"synthetic-strong-password");
  const staff:WorkspaceUser={id:account.id,memberId:account.memberId,name:account.name,email:account.email,role:"Manager",isOwner:false};
  expect(()=>requireBook(one.id,staff)).toThrow(/access/);
  saveClientBook({id:one.id,clientId:one.clientId,name:one.name,revision:1,grants:[{accountId:account.id,level:"view"}],reviewed:true},owner);
  expect(requireBook(one.id,staff)?.id).toBe(one.id);expect(()=>requireBook(one.id,staff,true)).toThrow(/access/);expect(()=>requireBook(two.id,staff)).toThrow(/access/);
  saveClientBook({id:one.id,clientId:one.clientId,name:one.name,revision:2,grants:[],reviewed:true},owner);expect(()=>requireBook(one.id,staff)).toThrow(/access/);
  const separate=mkdtempSync(path.join(tmpdir(),"shuug-books-isolation-"));try{vi.stubEnv("DEALDESK_DATA_DIR",separate);expect(()=>requireBook(one.id,owner)).toThrow(/access/);}finally{vi.stubEnv("DEALDESK_DATA_DIR",dir);rmSync(separate,{recursive:true,force:true});}
});
it("rejects changed retries, duplicate references, bad balances and stale matching without adding a posting",async()=>{
  const book=create(),base={accountNumber:1000,from:"2026-10-01",through:"2026-10-31",openingCents:0,closingCents:1000,reference:"Statement",csv:"date,description,amount,reference\n2026-10-02,Sale,10.00,ref1"};
  await expect(command(book.id,"statement.import",{...base,closingCents:999})).rejects.toThrow(/exactly/);
  await command(book.id,"statement.import",base);const s=(await bookView(book.id,owner)).statements[0];
  await expect(command(book.id,"statement.post",{id:s.id,revision:1,rowId:"1",allocations:[{accountNumber:4000,amountCents:999}]})).rejects.toThrow(/equal/);expect(manualJournalData(book.id).entries).toHaveLength(0);
  await command(book.id,"statement.post",{id:s.id,revision:1,rowId:"1",allocations:[{accountNumber:4000,amountCents:1000}]});
  await expect(command(book.id,"statement.post",{id:s.id,revision:1,rowId:"1",allocations:[{accountNumber:4000,amountCents:1000}]})).rejects.toThrow(/changed/);expect(manualJournalData(book.id).entries).toHaveLength(1);
  expect(()=>parseStatementCsv('date,description,amount,reference\n2026-10-02,"A, B",10.00,r1\n2026-10-02,Again,10.00,r1')).toThrow(/Duplicate/);
});
it("closes annual income into retained earnings without changing the year's P&L",async()=>{
  const book=create();await command(book.id,"statement.import",{accountNumber:1000,from:"2025-01-01",through:"2025-12-31",openingCents:0,closingCents:20000,reference:"Year",csv:"date,description,amount,reference\n2025-12-15,Sales,200.00,year-sale"});
  const s=(await bookView(book.id,owner)).statements[0];await command(book.id,"statement.post",{id:s.id,revision:1,rowId:"1",allocations:[{accountNumber:4000,amountCents:20000}]});await command(book.id,"statement.finish",{id:s.id,revision:2});
  await command(book.id,"year.close",{through:"2025-12-31",reason:"Annual books approved"});const view=await bookView(book.id,owner);
  expect(view.reports.pnl.netIncomeCents).toBe(20000);expect(view.reports.balanceSheet.equity.retainedEarningsCents).toBe(20000);expect(view.reports.balanceSheet.netIncomeCents).toBe(0);
});
