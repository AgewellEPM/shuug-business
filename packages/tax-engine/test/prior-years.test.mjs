import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pdfText} from './pdf-text.mjs';
import {ordinaryTax} from '../ordinary-tax.mjs';
import {calculateReturn,newReturn,calculationYears} from '../index.mjs';
import {generateDraftPdf} from '../pdf.mjs';
import {reviewed,business,wage} from './fixtures.mjs';
const loadTemplate=(id,year)=>readFile(new URL(`../forms/${year}/${id}.pdf`,import.meta.url));
function pageWords(bytes){
  const xml=pdfText(bytes,'-bbox-layout');
  return [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(([,page])=>[...page.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(([,attrs,text])=>({text,x:Number(attrs.match(/xMin="([^"]+)"/)[1]),top:(Number(attrs.match(/yMin="([^"]+)"/)[1])+Number(attrs.match(/yMax="([^"]+)"/)[1]))/2})));
}
function at(pages,page,text,minX,top){assert(pages[page-1].some(word=>word.text===String(text)&&word.x>=minX&&Math.abs(word.top-top)<8),`Actual annual PDF: ${text}, page ${page}, x >= ${minX}, top ${top}`);}
for(const year of [2023,2024]){
  test(`${year} published IRS table intervals, worked example and worksheet transitions`,async()=>{
    const module=await import(`../data/${year}-tax-table.mjs`),table=module[`taxTable${year}`],worksheets=module[`taxComputation${year}`];assert.equal(table.length,2062);
    let previous=0;for(const row of table){assert.equal(row[0],previous);previous=row[1];for(const [i,status]of ['single','marriedJoint','marriedSeparate','headOfHousehold'].entries())for(const dollars of [row[0],row[1]-1])assert.equal(ordinaryTax(dollars*100,status,year).taxCents,row[i+2]*100);}assert.equal(previous,100000);
    assert.equal(ordinaryTax(2530000,'marriedJoint',year).taxCents,year===2023?259900:257500);
    assert.equal(ordinaryTax(10000000,'single',year).taxCents,year===2023?1740000:1705300);
    for(const [status,rows]of Object.entries(worksheets))for(const [index,[ceiling,rate,subtract]]of rows.entries()){
      const floor=index===0?100000:rows[index-1][0]+1,expected=Math.floor((floor*rate-subtract+50)/100)*100;
      assert.equal(ordinaryTax(floor*100,status,year).taxCents,expected);
      if(ceiling!==null)assert.equal(ordinaryTax(ceiling*100,status,year).rate,rate);
    }
  });
  test(`${year} annual standard deductions, Social Security cap and QBI limit are selected`,()=>{
    const input=reviewed();input.year=year;input.individual.w2s=[wage('taxpayer',50000)];let result=calculateReturn(input);assert.equal(result.summary.totalTaxCents,year===2023?412100:401900);assert.equal(result.forms[0].lines['12'],year===2023?1385000:1460000);assert(!Object.hasOwn(result.forms[0].lines,'12e'));
    input.individual.w2s=[wage('taxpayer',160200)];input.individual.businesses=[business('taxpayer',10000)];result=calculateReturn(input);assert.equal(result.forms.find(form=>form.form==='f1040sse').lines['10'],year===2023?0:104200);
    input.individual.w2s=[];input.individual.businesses=[business('taxpayer',10000)];const base=calculateReturn(input),threshold=year===2023?18210000:19195000,deduction=year===2023?1385000:1460000;
    input.individual.taxableInterestCents=threshold+deduction-base.summary.adjustedGrossIncomeCents;assert(!calculateReturn(input).diagnostics.some(d=>d.code==='QBI_COMPLEX_LIMITS'));input.individual.taxableInterestCents+=100;assert(calculateReturn(input).diagnostics.some(d=>d.code==='QBI_COMPLEX_LIMITS'));
  });
  test(`${year} original 1040/C/SE/QBI PDF locations, identity and one status checkbox`,async()=>{
    const input=reviewed();input.year=year;input.individual.businesses=[business()];const packet=await generateDraftPdf(input,{loadTemplate}),pages=pageWords(packet.bytes),main=packet.audit.find(item=>item.form==='f1040');
    assert.equal(packet.result.year,year);assert.equal(packet.result.filingReady,false);at(pages,main.firstPage,'Synthetic',36,102);assert.equal(pages[main.firstPage-1].filter(word=>word.x>=470&&Math.abs(word.top-96)<2).sort((a,b)=>a.x-b.x).map(word=>word.text).join(''),'000123456');
    at(pages,main.firstPage,year===2023?48398:47798,504,year===2023?696:720);at(pages,main.firstPage+1,year===2023?17254:16868,504,138);
    at(pages,packet.audit.find(item=>item.form==='f1040sc').firstPage,80000,475,666);at(pages,packet.audit.find(item=>item.form==='f1040sse').firstPage,year===2023?'160,200':'168,600',450,402);
    at(pages,packet.audit.find(item=>item.form==='f8995').firstPage,year===2023?12100:11950,504,570);
    assert.equal(main.filled.filter(field=>field.checkbox).length,1);assert.match(main.filled.find(field=>field.checkbox).checkbox,year===2023?/Page1\[0\]\.c1_3\[0\]$/:/FilingStatus_ReadOrder\[0\]\.c1_3\[0\]$/);
  });
  test(`${year} entity identity, ordinary-income K-1 allocations and Schedule J retain annual rows`,async()=>{
    for(const kind of ['1065','1120S','1120']){
      const input=reviewed(kind);input.year=year;input.entity.receiptsCents=10000100;input.entity.estimatedPaymentsCents=1500000;input.entity.owners=[{id:'a',name:'Synthetic Owner A',taxId:'000111111',shareBps:5000},{id:'b',name:'Synthetic Owner B',taxId:'000222222',shareBps:5000}];
      const packet=await generateDraftPdf(input,{loadTemplate}),pages=pageWords(packet.bytes),main=packet.audit[0];at(pages,main.firstPage,'000123456',kind==='1065'?489:453,kind==='1065'?101:kind==='1120S'?113:89);at(pages,main.firstPage,'Hartford,',150,kind==='1065'?155:kind==='1120S'?161:137);
      if(kind==='1120'){at(pages,main.firstPage,6000,504,618);at(pages,main.firstPage+2,21000,504,year===2023?342:462);at(pages,main.firstPage+2,15000,504,year===2023?546:654);}
      else{at(pages,packet.audit[1].firstPage,50001,331,89);at(pages,packet.audit[2].firstPage,50000,331,89);if(kind==='1120S')at(pages,packet.audit[1].firstPage,'50.00',208,year===2023?474:534);}
    }
  });
  test(`${year} export refuses a valid blank belonging to a different year`,async()=>{
    const input=reviewed();input.year=year;await assert.rejects(()=>generateDraftPdf(input,{loadTemplate:id=>loadTemplate(id,2025)}),/integrity/);
  });
}
test('unsupported years cannot silently use installed rules or create a return',()=>{
  assert.deepEqual(calculationYears,[2023,2024,2025,2026,2027]);for(const year of [2022,2028,'2023',null]){assert.throws(()=>newReturn('1040',year));assert.throws(()=>ordinaryTax(5000000,'single',year));const input=reviewed();input.year=year;assert.equal(calculateReturn(input).calculationAvailable,false);}
});
