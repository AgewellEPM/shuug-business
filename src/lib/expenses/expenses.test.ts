// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { archiveExpense, createReceiptExpense, listExpenses, readExpense, receiptHash, receiptPath, saveExpense } from "./store";
import { blankExpense, dateOnly, decimalCents, expensesCsv, type ReceiptFile } from "./model";
import { receiptSuggestions } from "./extract";
import { MAX_RECEIPT_BYTES, receiptType } from "./ocr";
let dir:string;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"shuug-expenses-test-"));vi.stubEnv("DEALDESK_DATA_DIR",dir);});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
const fields=()=>({...blankExpense("2026-09-10"),merchant:"Fixture Office Supply",amountCents:10825,taxCents:825});
it("extracts conservative receipt suggestions and leaves conflicting totals for review",()=>{
  expect(receiptSuggestions("FIXTURE OFFICE SUPPLY\n09/10/2026\nSubtotal 100.00\nTax 8.25\nTOTAL USD 108.25\nCash 120.00\nChange 11.75")).toEqual({merchant:"FIXTURE OFFICE SUPPLY",date:"2026-09-10",amountCents:10825,taxCents:825,currency:"USD"});
  expect(receiptSuggestions("Store\nTOTAL 10.00\nAmount paid 20.00").amountCents).toBeUndefined();
  expect(receiptSuggestions("STORE\n02/30/2026\nSubtotal 99.00").date).toBeUndefined();
  expect(receiptSuggestions("STORE\nSubtotal 99.00\nTax 1.00").amountCents).toBeUndefined();
});
it("validates actual file signatures, size, dates and exact cents",()=>{
  expect(receiptType(Buffer.from("%PDF-1.4\nfixture"))).toEqual({extension:"pdf",mime:"application/pdf"});
  expect(()=>receiptType(Buffer.from("<svg>receipt.png</svg>"))).toThrow(/Choose/);
  expect(()=>receiptType(Buffer.alloc(MAX_RECEIPT_BYTES+1))).toThrow(/10 MB/);
  expect(dateOnly.safeParse("2024-02-29").success).toBe(true);expect(dateOnly.safeParse("2026-02-29").success).toBe(false);
  expect(decimalCents("10.29")).toBe(1029);expect(decimalCents("10.2")).toBe(1020);expect(decimalCents("")).toBeNull();expect(()=>decimalCents("10.299")).toThrow();
});
it("retains originals and deduplicates uploads before they can count twice",()=>{
  const bytes=Buffer.from("%PDF-1.4\nfixture receipt"),receipt:ReceiptFile={hash:receiptHash(bytes),name:"fixture.pdf",...receiptType(bytes),bytes:bytes.length,text:"fixture",extraction:"read",message:"Review"};
  const first=createReceiptExpense(fields(),receipt,bytes),second=createReceiptExpense(fields(),receipt,bytes);
  expect(first.expense.status).toBe("draft");expect(second.duplicate).toBe(true);expect(second.expense.id).toBe(first.expense.id);expect(listExpenses()).toHaveLength(1);
  expect(readFileSync(receiptPath(receipt))).toEqual(bytes);expect(statSync(receiptPath(receipt)).mode&0o777).toBe(0o600);
  expect(()=>receiptPath({...receipt,hash:"../../private"})).toThrow();
});
it("persists review, rejects stale edits, retains prior versions, and supports archive and restore",()=>{
  const first=saveExpense({fields:fields(),status:"recorded"}).expense!;
  const changed=saveExpense({id:first.id,revision:1,fields:{...fields(),amountCents:11000},status:"recorded"}).expense!;
  expect(()=>saveExpense({id:first.id,revision:1,fields:fields(),status:"recorded"})).toThrow(/changed/);
  const archived=archiveExpense(first.id,2);expect(archived.status).toBe("archived");const restored=archiveExpense(first.id,3,true);expect(restored.status).toBe("recorded");
  const saved=readExpense(first.id);expect(saved.history).toHaveLength(4);expect(saved.history[0].fields.amountCents).toBe(10825);expect(saved.fields.amountCents).toBe(changed.fields.amountCents);
});
it("blocks unreviewable records and requires an explicit choice for suspected duplicates",()=>{
  expect(()=>saveExpense({fields:blankExpense("2026-09-10"),status:"recorded"})).toThrow(/business name/);
  expect(()=>saveExpense({fields:{...fields(),taxCents:99999},status:"recorded"})).toThrow(/Tax/);
  const first=saveExpense({fields:fields(),status:"recorded"}).expense!;
  expect(saveExpense({fields:fields(),status:"recorded"})).toEqual({expense:null,duplicate:first.id});
  expect(saveExpense({fields:fields(),status:"recorded",confirmDuplicate:true}).expense).toBeTruthy();
});
it("exports reviewed values with formula injection protection and separate currencies",()=>{
  const first=saveExpense({fields:{...fields(),merchant:"=HYPERLINK(\"example\")",notes:"\t=1+1",currency:"CAD",kind:"refund"},status:"recorded"}).expense!;
  const csv=expensesCsv([first]);expect(csv).toContain("'=HYPERLINK");expect(csv).toContain("'=1+1");expect(csv).toContain('"CAD"');expect(csv).toContain('"-108.25"');
});
