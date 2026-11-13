import {PDFDocument,StandardFonts,PDFName,rgb} from 'pdf-lib';
import {ctTemplates,ctLineMaps} from './state-ct-maps.mjs';
import {displayMoney,wholeDollars} from './money.mjs';
export function ctPdfYearPack(year){const template=ctTemplates[year];return {templates:template?[template]:[],lineMaps:template?{ct1040:ctLineMaps[year]}:{},scheduleMaps:{}};}
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const dollars=value=>String(wholeDollars(value)/100);
const id=value=>String(value??'').replaceAll('-','');

/** Overlay reviewed line boxes on pinned, nonfillable DRS originals. The caller
 * adds the packet's draft watermark. No identity or tax data leaves the caller. */
export async function renderCTForm(input,item,{loadTemplate}={}){
 const approved=ctTemplates[input.year],maps=ctLineMaps[input.year];if(!approved||item.form!=='ct1040'||item.state!=='CT'||typeof loadTemplate!=='function')throw new Error('No reviewed Connecticut form template is available.');
 const bytes=new Uint8Array(await loadTemplate('ct1040',input.year));if(bytes.length!==approved.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==approved.sha256)throw new Error('The Connecticut form failed its pinned integrity check.');
 const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()!==4||pdf.getForm().getFields().length!==0||pdf.getPages().some(page=>Math.abs(page.getWidth()-589.68)>.01||page.getHeight()!==774||page.getRotation().angle!==0))throw new Error('The Connecticut form structure changed.');
 for(const key of ['OpenAction','AA','Names'])pdf.catalog.delete(PDFName.of(key));for(const page of pdf.getPages())for(const key of ['Annots','AA'])page.node.delete(PDFName.of(key));
 const font=await pdf.embedFont(StandardFonts.Helvetica),filled=[];
 const draw=(box,value,label,{right=false,size=9}={})=>{
  if(value===null||value===undefined||value==='')return;const text=String(value);if(/[\r\n]/.test(text))throw new Error('A Connecticut form box cannot contain unreviewed line breaks.');
  while(size>6&&font.widthOfTextAtSize(text,size)>box.width)size-=.25;
  if(size<6||font.widthOfTextAtSize(text,size)>box.width)throw new Error('A Connecticut form field cannot fit the original text or amount. Review the source; no truncated value was exported.');
  const x=right?box.x+box.width-font.widthOfTextAtSize(text,size):box.x,y=774-box.top-Math.min(box.height-2,size+1);pdf.getPage(box.page).drawText(text,{x,y,size,font,color:rgb(0,0,0)});filled.push({line:label,page:box.page,x,y,width:box.width});
 };
 const box=(page,x,top,width,height=14)=>({page,x,top,width,height});
 const digits=(page,positions,top,value,label,size=10)=>{if(!value)return;if(!/^\d+$/.test(value)||value.length!==positions.length)throw new Error(`Connecticut ${label} must fit its exact digit boxes.`);for(const [index,x]of positions.entries())draw(box(page,x,top,9,14),value[index],`${label}:${index+1}`,{size});};
 const shift=input.year===2023?16:0,person=input.party,individual=input.individual,state=input.individual.stateReturns.find(value=>value.state==='CT');
 const identity=(x,top,width,value,label)=>draw(box(0,x,top+shift,width,16),value,label,{size:10});
 const check={single:[55,102],marriedJoint:[55,118],headOfHousehold:[175,102],survivingSpouse:[175,118],marriedSeparate:[295,102]}[individual.filingStatus];if(!check)throw new Error('Connecticut filing status is missing.');identity(check[0],check[1],8,'X','filingStatus');
 const ssnPositions=[60.8,75.6,90.4,115,129.7,154.3,169.1,183.9,198.7];digits(0,ssnPositions,142+shift,id(person.taxId),'taxpayerId');identity(56,172,144,person.firstName,'firstName');identity(273,172,216,person.lastName,'lastName');identity(56,231,249,person.street,'street');identity(56,260,249,person.city,'city');identity(323,260,40,person.state,'state');identity(381,260,100,person.zip,'zip');identity(56,290,249,state.town,'residenceTown');identity(323,290,100,state.townZip,'residenceZip');
 if(['marriedJoint','marriedSeparate'].includes(individual.filingStatus))digits(0,ssnPositions.map(x=>x+266.5),142+shift,id(individual.spouseTaxId),'spouseTaxpayerId');
 if(individual.filingStatus==='marriedJoint'){identity(56,201,144,individual.spouseFirstName,'spouseFirstName');identity(273,201,216,individual.spouseLastName,'spouseLastName');}
 if(individual.filingStatus==='marriedSeparate')identity(415,106,137,individual.spouseName,'separateSpouseName');
 for(const page of [1,2,3])digits(page,[382.8,396.8,410.8,434.1,448.1,471.4,485.4,499.4,513.4],29,id(person.taxId),'taxpayerId');
 for(const [line,value]of Object.entries(item.lines)){if(value===null||value===undefined)continue;const target=maps[line];if(!target)throw new Error(`Connecticut line ${line} has no reviewed annual overlay.`);draw(target,dollars(value),line,{right:true});}
 for(const [index,row]of item.withholdings.slice(0,5).entries()){
  const target=maps[`18${'abcde'[index]}`];digits(1,Array.from({length:9},(_,position)=>107.5+position*17.22),target.top,id(row.payerId),`18${'abcde'[index]}:payerId`,9);draw(box(1,277,target.top,102,12),dollars(row.wagesCents),`18${'abcde'[index]}:wages`,{right:true});draw(target,dollars(row.withholdingCents),`18${'abcde'[index]}:withheld`,{right:true});
 }
 for(const row of item.adjustments.filter(row=>['37','49'].includes(row.line))){const target=maps[row.line];draw(box(2,row.line==='37'?112:233,target.top,row.line==='37'?284:163,12),row.description,`${row.line}:description`,{size:8});}
 if(item.propertyCredit&&item.lines['63']!==undefined){
  for(const row of item.propertyTaxes){const line={residence:'60',auto1:'61',auto2:'62'}[row.kind],target=maps[line];draw(box(3,129,target.top,55,12),row.town,`${line}:town`,{size:8});draw(box(3,197,target.top,148,12),row.description,`${line}:description`,{size:8});for(const [index,date]of row.paidDates.split(',').map(date=>date.trim()).entries()){const [year,month,day]=date.split('-');digits(3,[360.5,371,388,398.9,416.7,426.4,436.0,445.7],target.top-8+index*14,`${month}${day}${year}`,`${line}:date${index+1}`,8);}}
  const fraction=(item.propertyCredit.phaseOutBps/10000).toFixed(2).slice(2);draw(box(3,519,273,23,14),fraction,'66',{size:10});
 }
 const audit={form:'ct1040',year:input.year,copyId:item.copyId,templateSha256:approved.sha256,sourceDraft:approved.sourceDraft,fields:filled};return {bytes:await pdf.save({useObjectStreams:false}),audit};
}
export function ctWorkpaper(input,result,line){
 for(const state of result.states??[]){line(`${state.state} ${input.year} state preparation`,13);for(const [key,value]of Object.entries(state.summary))line(`${key.replace(/Cents$/,'').replace(/([A-Z])/g,' $1')}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}`);if(state.state!=='CT')continue;
  const source=input.individual.stateReturns.find(value=>value.state==='CT');if(state.calculation){line('Connecticut Tax Calculation Schedule (annual Tables A-E)',11);for(const [key,value]of Object.entries(state.calculation))line(`${key}: ${key.endsWith('Bps')?(value/100)+'%':displayMoney(value)+' USD'}`);}
  if(state.propertyCredit){line('Connecticut property-tax credit',11);for(const [key,value]of Object.entries(state.propertyCredit))line(`${key}: ${key.endsWith('Bps')?(value/100)+'%':displayMoney(value)+' USD'}`);if(state.propertyCredit.allowedCreditCents<state.propertyCredit.calculatedCreditCents)line('Schedule 3 credit is limited to CT-1040 line 10 income tax under the DRS maximum-credit rule.');}
  for(const row of source.adjustments)line(`Schedule 1 line ${row.line}: ${displayMoney(row.amountCents)} USD; ${row.description}; source ${row.source}; reviewed ${row.reviewed}.`);
  if(state.retirement?.required){line('Source-linked Connecticut retirement worksheets',11);line(`Source: ${source.retirement.source}; reviewed ${source.retirement.reviewed}; resolved ${state.retirement.known}.`);for(const [key,value]of Object.entries(state.retirement.socialSecurity??{}))line(`Social Security worksheet ${key}: ${typeof value==='number'?displayMoney(value)+' USD':value}`);for(const [key,value]of Object.entries(state.retirement.pension??{}))line(`Pension worksheet ${key}: ${value===null?'UNRESOLVED':key.endsWith('Bps')?value/100+'%':displayMoney(value)+' USD'}`);for(const row of state.retirement.sources)line(`Federal distribution ${row.distributionId}: ${row.owner}, ${row.kind}, teacher election ${row.teacherElection}; source ${row.source}.`);for(const [key,value]of Object.entries(state.retirement.lines))line(`Calculated CT Schedule 1 line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}`);}
  for(const row of source.withholdings)line(`Connecticut withholding: ${row.payer}; wages ${displayMoney(row.wagesCents)} USD; withheld ${displayMoney(row.withholdingCents)} USD; source ${row.source}; reviewed ${row.reviewed}.`);
  for(const row of source.propertyTaxes)line(`Property tax ${row.kind}: ${row.description}, ${row.town}; paid ${row.paidDates}; ${displayMoney(row.amountCents)} USD; source ${row.source}; reviewed ${row.reviewed}.`);
  line(`Use-tax worksheet: ${source.useTax.source||'No source entered'}; reviewed ${source.useTax.reviewed}.`);
 }
}
