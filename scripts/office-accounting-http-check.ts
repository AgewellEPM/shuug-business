import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

/** Called inside the MFA check's disposable compiled-server fixture. */
export async function officeAccountingHttpCheck(base:string,ownerCookie:string,staffCookie:string,staffId:string,clientId:string){
  let checks=0;
  const request=(route:string,init:RequestInit={},cookie=ownerCookie)=>fetch(base+route,{...init,redirect:"manual",signal:AbortSignal.timeout(15000),headers:{Cookie:cookie,...init.headers}});
  async function json(route:string,input:unknown,cookie=ownerCookie){
    const response=await request(route,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify(input)},cookie);
    const body=await response.json();assert.equal(response.status,200,body.error);return body;
  }
  const {book}=await json("/api/accounting/books",{clientId,name:"Synthetic mapped client book",revision:0,grants:[],reviewed:true});checks++;
  const path=`/api/accounting/books/${book.id}`;
  const command=(action:string,input:unknown)=>json(path,{requestId:randomUUID(),action,input});
  await command("account.save",{number:1020,name:"Synthetic second bank",classification:"bank",parentNumber:1000,active:true,revision:0,reviewed:true});checks++;
  const mapping={mode:"split",headerRow:0,dateColumn:0,descriptionColumn:1,debitColumn:2,creditColumn:3,referenceColumn:null,dateFormat:"mdy"};
  const input={accountNumber:1020,from:"2026-10-01",through:"2026-10-31",openingCents:0,closingCents:10000,reference:"Mapped October",csv:"Date,Description,Debit,Credit\n10/01/2026,Client payment,,120.00\n10/02/2026,Office costs,20.00,",mapping,reviewed:true};
  await command("statement.import",input);
  let view=await(await request(path)).json(),statement=view.statements[0];
  assert.equal(view.entries.length,0);assert.deepEqual(statement.mapping,mapping);assert.deepEqual(statement.rows.map((r:{amountCents:number})=>r.amountCents),[12000,-2000]);checks++;
  for(const [rowId,accountNumber,amountCents] of [["1",4000,12000],["2",6300,2000]] as const){
    await command("statement.post",{id:statement.id,revision:statement.revision,rowId,allocations:[{accountNumber,amountCents}],reviewed:true});
    view=await(await request(path)).json();statement=view.statements[0];
  }
  assert.equal(view.entries.length,2);assert.equal(view.reports.balanceSheet.assets.cashCents,10000);assert.equal(view.reports.balanceSheet.assetsCents,10000);assert.equal(view.reports.pnl.netIncomeCents,10000);assert.equal(view.reports.balanceSheet.balanced,true);checks++;
  assert(view.entries.every((entry:{memo:string})=>entry.memo.includes("Statement row shuug-statement:")));checks++;
  await command("statement.finish",{id:statement.id,revision:statement.revision,reviewed:true});checks++;
  const duplicate=await request(path,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({requestId:randomUUID(),action:"statement.import",input:{...input,reference:"A duplicate export"}})});
  assert.equal(duplicate.status,400);assert.match((await duplicate.json()).error,/non-overlapping/);checks++;
  const exported=await request(`${path}?format=csv`);assert.equal(exported.status,200);assert.match(await exported.text(),/Synthetic second bank/);checks++;
  await command("period.close",{through:"2026-10-31",reason:"Synthetic statement and ledger reviewed",reviewed:true});checks++;
  const closed=await request(path,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({requestId:randomUUID(),action:"journal.post",input:{date:"2026-10-02",memo:"Backdate probe",reviewed:true,lines:[{accountNumber:1020,debitCents:100,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:100}]}})});
  assert.equal(closed.status,400);assert.match((await closed.json()).error,/closed through/);checks++;
  assert.equal((await(await request("/api/accounting/books/office")).json()).reports.balanceSheet.assets.cashCents,0);checks++;

  await json("/api/workspace/employees",{action:"role",id:staffId,role:"Manager"});
  assert.equal((await request(path,{},staffCookie)).status,403);checks++;
  await json("/api/accounting/books",{id:book.id,clientId,name:book.name,revision:1,grants:[{accountId:staffId,level:"view"}],reviewed:true});
  const staffView=await request(path,{},staffCookie);assert.equal(staffView.status,200);assert.equal((await staffView.json()).reports.balanceSheet.assets.cashCents,10000);checks++;
  const forbidden=await request(path,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({requestId:randomUUID(),action:"period.reopen",input:{through:"2026-10-31",reason:"Unauthorized change",reviewed:true}})},staffCookie);assert.equal(forbidden.status,403);checks++;
  await json("/api/accounting/books",{id:book.id,clientId,name:book.name,revision:2,grants:[],reviewed:true});assert.equal((await request(path,{},staffCookie)).status,403);checks++;
  return {checks,coverage:["custom-bank cash summary","mapped import without posting","reviewed posting and exact reconciliation","duplicate/overlap rejection","CSV export","period close and backdate denial","office/client isolation","MFA-authenticated staff grants and immediate revocation"]};
}
