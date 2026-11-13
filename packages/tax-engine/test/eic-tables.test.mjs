import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {eicTableLookup,eicWorksheetAnnual} from '../eic-tables.mjs';
import {eicTable2023,eicTerminal2023} from '../data/2023-eic-table.mjs';
import {eicTable2024,eicTerminal2024} from '../data/2024-eic-table.mjs';
import {eicTable2025,eicTerminal2025} from '../data/2025-eic-table.mjs';
const reference=JSON.parse(readFileSync(new URL('./eic-award-reference.json',import.meta.url))),packs={2023:[eicTable2023,eicTerminal2023],2024:[eicTable2024,eicTerminal2024],2025:[eicTable2025,eicTerminal2025]};
for(const year of [2023,2024,2025])test(`${year} exact published EIC cells and every interval edge across all eight columns`,()=>{
 const [rows,terminals]=packs[year],ref=reference.tableReferences[year];assert.equal(rows.length,ref.rowCount);assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),ref.normalizedRowsSha256);assert.equal(terminals.length,8);
 const look=(dollars,column)=>eicTableLookup(dollars*100,{year,filingStatus:column>=4?'marriedJoint':'single',qualifyingChildren:column%4});
 const expected=(dollars,column)=>{const terminal=terminals.find(row=>row[0]===column);if(dollars<=0||dollars>=terminal[2])return 0;if(dollars>=terminal[1])return terminal[3];return rows.find(row=>dollars>=row[0]&&dollars<row[1])[column+2];};
 for(let i=0;i<rows.length;i++){
  const row=rows[i];assert.equal(row[0],i?rows[i-1][1]:1);assert.equal(row[1],i?(i+1)*50:50);
  for(let column=0;column<8;column++)for(const dollars of [row[0],row[1]-1,row[1]])assert.equal(look(dollars,column).creditCents,expected(dollars,column)*100,`${year} column${column} $${dollars}`);
 }
 for(const [column,lower,upper,credit]of terminals){assert.equal(look(lower,column).terminalFootnote,true);assert.deepEqual(look(upper-1,column).interval,[lower*100,upper*100]);assert.equal(look(upper-1,column).creditCents,credit*100);assert.equal(look(upper,column).creditCents,0);assert.equal(look(upper,column).terminalFootnote,false);}
 assert.equal(look(0,0).creditCents,0);assert.equal(look(-1,0).creditCents,0);assert.equal(look(1,1).creditCents,900);
 assert.deepEqual(eicWorksheetAnnual[year].agiComparisonThresholds,reference.annualParameters[year].agiComparisonThresholdsDollars.map(value=>value*100));assert.equal(eicWorksheetAnnual[year].investmentLimitCents,reference.annualParameters[year].investmentLimitDollars*100);
});
test('published 2025 single-child lookup, dollar rounding, surviving-spouse columns and unsupported years',()=>{
 const options={year:2025,filingStatus:'single',qualifyingChildren:1};assert.equal(eicTableLookup(245500,options).creditCents,84200);assert.equal(eicTableLookup(4999,options).creditCents,2600);assert.equal(eicTableLookup(4949,options).creditCents,900);
 for(const filingStatus of ['survivingSpouse','headOfHousehold','marriedSeparate'])assert.equal(eicTableLookup(2500000,{...options,filingStatus,qualifyingChildren:0}).creditCents,0);
 assert(eicTableLookup(2500000,{...options,filingStatus:'marriedJoint',qualifyingChildren:0}).creditCents>0);
 assert.equal(eicTableLookup(1000000,{...options,qualifyingChildren:100}).creditCents,eicTableLookup(1000000,{...options,qualifyingChildren:3}).creditCents);
 for(const year of [2026,2027,2028])assert.throws(()=>eicTableLookup(1000000,{...options,year}),/No final IRS EIC/);assert.throws(()=>eicTableLookup(1000000,{...options,qualifyingChildren:1.5}),/exact supported count/);
});
