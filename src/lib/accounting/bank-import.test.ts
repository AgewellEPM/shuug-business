// @vitest-environment node
import {expect,it} from "vitest";
import {parseStatementCsv,statementCsvColumns,type StatementMapping} from "./bank-import";
const signed:StatementMapping={mode:"signed",headerRow:0,dateColumn:0,descriptionColumn:1,amountColumn:2,referenceColumn:3,dateFormat:"mdy",positiveMeans:"deposit"};
const split:StatementMapping={mode:"split",headerRow:0,dateColumn:0,descriptionColumn:1,debitColumn:2,creditColumn:3,referenceColumn:null,dateFormat:"mdy"};
it("keeps the original strict CSV contract and rejects empty and malformed statements",()=>{
  expect(parseStatementCsv("date,description,amount,reference\n2026-10-01,Sale,10.00,bank1")[0].amountCents).toBe(1000);
  expect(()=>parseStatementCsv("date,description,amount,reference\n")).toThrow(/1 to 5,000/);
  expect(()=>parseStatementCsv('date,description,amount,reference\n2026-10-01,"Unclosed,10.00,bank1')).toThrow(/quote/);
});
it("maps bank header names, USD formatting and explicit date formats",()=>{
  const rows=parseStatementCsv('Posted,Payee,Value,ID\n10/7/2026,"A, B","$1,234.50",bank1\n10/8/2026,Software,($20.00),bank2',signed);
  expect(rows.map(r=>[r.date,r.description,r.amountCents])).toEqual([["2026-10-07","A, B",123450],["2026-10-08","Software",-2000]]);
  expect(parseStatementCsv("Date,Text,Amount,Ref\n07/10/2026,Sale,10.00,one",{...signed,dateFormat:"dmy"})[0].date).toBe("2026-10-07");
  expect(parseStatementCsv("Date,Text,Amount,Ref\n10/07/2026,Sale,10.00,one",{...signed,positiveMeans:"withdrawal"})[0].amountCents).toBe(-1000);
});
it("preserves separate debit and credit meaning and labels generated references by statement",()=>{
  const csv="Date,Description,Debit,Credit\n10/01/2026,Client payment,,120.00\n10/02/2026,Office costs,20.00,";
  const rows=parseStatementCsv(csv,split,"shuug-statement:2026-10-01:2026-10-31");
  expect(rows.map(r=>r.amountCents)).toEqual([12000,-2000]);
  expect(rows.map(r=>r.reference)).toEqual(["shuug-statement:2026-10-01:2026-10-31:1","shuug-statement:2026-10-01:2026-10-31:2"]);
  expect(()=>parseStatementCsv("Date,Description,Debit,Credit\n10/01/2026,Ambiguous,10.00,5.00",split)).toThrow(/exactly one/);
  expect(()=>parseStatementCsv("Date,Description,Debit,Credit\n10/01/2026,Reversal,-10.00,",split)).toThrow(/nonnegative/);
});
it("supports a selected header row without silently ignoring trailing totals",()=>{
  const csv="Export for account ending 1234\nDate,Description,Amount,Reference\n10/01/2026,Sale,10.00,ref1";
  expect(statementCsvColumns(csv,1)).toEqual(["Date","Description","Amount","Reference"]);
  expect(parseStatementCsv(csv,{...signed,headerRow:1})).toHaveLength(1);
  const spaced="\nExport for account ending 1234\n\nDate,Description,Amount,Reference\n10/01/2026,Sale,10.00,ref1\n\n";
  expect(statementCsvColumns(spaced,3)).toEqual(["Date","Description","Amount","Reference"]);
  expect(parseStatementCsv(spaced,{...signed,headerRow:3})[0].date).toBe("2026-10-01");
  expect(()=>parseStatementCsv(csv+"\nTotal,10.00",{...signed,headerRow:1})).toThrow(/row 4.*Column count/);
});
it("rejects invalid grouping, impossible dates, reused columns and duplicate identifiers",()=>{
  for(const amount of ["$1,23.00","--10.00","1.001","(+10.00)"]){expect(()=>parseStatementCsv(`Date,Text,Amount,Ref\n10/01/2026,Sale,"${amount}",ref1`,signed)).toThrow();}
  expect(()=>parseStatementCsv("Date,Text,Amount,Ref\n02/30/2026,Sale,10.00,ref1",signed)).toThrow(/row 2/);
  expect(()=>parseStatementCsv("Date,Text,Amount,Ref\n10/01/2026,Sale,10.00,ref1",{...signed,amountColumn:0})).toThrow(/different column/);
  expect(()=>parseStatementCsv("Date,Text,Amount,Ref\n10/01/2026,Sale,10.00,ref1\n10/02/2026,Again,10.00,ref1",signed)).toThrow(/Duplicate/);
});
