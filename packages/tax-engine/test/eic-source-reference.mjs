import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pdfText} from './pdf-text.mjs';
import {eicTable2023} from '../data/2023-eic-table.mjs';
import {eicTable2024} from '../data/2024-eic-table.mjs';
import {eicTable2025} from '../data/2025-eic-table.mjs';
const tables={2023:eicTable2023,2024:eicTable2024,2025:eicTable2025};
const hash=value=>createHash('sha256').update(value).digest('hex');

// Two published table representations are compared with this same parser.
// This is source-byte/transcription verification, not an independent-provider
// correctness review, a sealed receipt, or agency qualification.
export function publishedEicRows(text){
 const rows=new Map();
 for(const line of text.split(/\r?\n/)){
  const tokens=line.trim().split(/\s+/);if(![10,20].includes(tokens.length)||tokens.some(token=>!/^\d[\d,]*$|^\*+$/.test(token)))continue;
  for(let index=0;index<tokens.length;index+=10){const row=tokens.slice(index,index+10).map(value=>value.startsWith('*')?value:Number(value.replaceAll(',','')));if(!Number.isSafeInteger(row[0])||!Number.isSafeInteger(row[1])||!(row[0]===1&&row[1]===50||row[0]>0&&row[0]%50===0&&row[1]-row[0]===50))continue;if(rows.has(row[0])&&JSON.stringify(rows.get(row[0]))!==JSON.stringify(row))throw new Error('Published EIC source has conflicting duplicate table rows.');rows.set(row[0],row);}
 }
 return [...rows.values()].sort((a,b)=>a[0]-b[0]);
}
export async function verifyEicSourceDirectory(directory){
 const reference=JSON.parse(await readFile(new URL('./eic-award-reference.json',import.meta.url),'utf8')),sourceChecks=[];let terminalFootnotesVerified=0;
 for(const source of reference.annualInstructions){
  const bytes=await readFile(path.join(directory,source.file));if(bytes.length!==source.bytes||hash(bytes)!==source.sha256)throw new Error('EIC source bytes differ from the reviewed pin: '+source.file);
  const text=pdfText(bytes,'-layout'),rows=publishedEicRows(text),expected=reference.tableReferences[source.year],normalizedRowsSha256=hash(JSON.stringify(rows));
  if(rows.length!==expected.rowCount||normalizedRowsSha256!==expected.normalizedRowsSha256||JSON.stringify(rows)!==JSON.stringify(tables[source.year]))throw new Error('Published EIC table differs from installed exact annual rows: '+source.file);
  const normalized=text.replace(/\s+/g,' '),dollars=value=>'$'+value.toLocaleString('en-US');
  // The original 2023 1040 instructions omit "is" in the joint-one-child
  // terminal footnote. Preserve that source typo without changing its amount.
  for(const row of expected.terminalFootnotes){const marker=`at least ${dollars(row.lowerDollars)} but less than ${dollars(row.upperExclusiveDollars)}`,start=normalized.indexOf(marker),tail=normalized.slice(start,start+450);if(start<0||![`your credit is ${dollars(row.creditDollars)}.`,`your credit ${dollars(row.creditDollars)}.`].some(text=>tail.includes(text)))throw new Error('Published EIC terminal footnote differs: '+source.file+' '+row.column);terminalFootnotesVerified++;}
  sourceChecks.push({year:source.year,id:source.id,file:source.file,bytes:bytes.length,sha256:hash(bytes),rows:rows.length,normalizedRowsSha256});
 }
 return {sourceChecks,sourcePinsVerified:sourceChecks.length,publishedAnnualTableRows:3979,tableCellComparisons:3979*8*2,terminalFootnotesVerified,classification:'Exact pinned bytes and same-parser comparison of two official publications; no agency approval or independent-provider verification.'};
}
