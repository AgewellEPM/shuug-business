import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pdfText} from './pdf-text.mjs';

export async function verifyCTEitcSources(directory){
 const manifest=JSON.parse(await readFile(new URL('../data/ct-eitc-sources.json',import.meta.url),'utf8')),verified=[],contentChecks=[];
 for(const source of manifest.sources){
  const bytes=await readFile(path.join(directory,source.file)),sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==source.bytes||sha256!==source.sha256)throw new Error(`CT EITC original source differs: ${source.file}`);
  verified.push({file:source.file,bytes:bytes.length,sha256});
  if(source.file.startsWith('schedule-ct-eitc--')){
   const text=pdfText(bytes,'-layout'),annual=manifest.annualRules[source.year],checks={year:text.includes(String(source.year)),rate:text.includes('40%'),investment:text.includes(annual.investmentLimitDollars.toLocaleString('en-US')),residentOnly:/part.year resident/.test(text),mainTransfer:text.includes('Line 20a'),splitAllocation:text.includes('1.0000'),supplement:(text.includes('$250.00'))===(source.year===2025),noDraftMark:!text.includes('DRAFT')};
   for(const [name,passed]of Object.entries(checks)){if(!passed)throw new Error(`CT EITC source content differs: ${source.year}/${name}`);contentChecks.push({year:source.year,check:name,passed});}
  }
 }
 return {classification:'Pinned official source bytes and annual schedule content checks; no agency qualification or independent-provider approval.',sourceCount:verified.length,checksPassed:contentChecks.length,sources:verified,checks:contentChecks};
}
