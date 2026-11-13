import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib';
import {wholeDollars,displayMoney} from './money.mjs';
import {nyChildTemplates,nyChildMoneyMaps,nyChildCountMaps,nyChildRowMap} from './state-ny-child-maps.mjs';

export function nyChildPdfYearPack(year){const templates=nyChildTemplates[year]??[];return {templates,lineMaps:templates.length?{nyit213:nyChildMoneyMaps[year],nyit213att:{}}:{},scheduleMaps:{}};}
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const identifier=value=>String(value??'').replaceAll('-','');
function birth(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('New York child credit birth date is incomplete.');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('New York child credit birth date is invalid.');return value.slice(5,7)+value.slice(8,10)+value.slice(0,4);}
function validateChildren(rows){
 if(!Array.isArray(rows)||rows.length>100)throw new Error('New York child credit sources exceed the reviewed limit.');
 for(const row of rows){if(!row.firstName?.trim()||!row.lastName?.trim()||!/^\d{9}$/.test(identifier(row.taxId)))throw new Error('New York child credit identity must be complete.');birth(row.dateOfBirth);}
}

/** The first six children belong on IT213. Remaining children use successive
 * original, same-year IT213ATT pages, seventeen rows per page. No synthetic form. */
export async function renderNYChildForm(input,item,{loadTemplate}={}){
 const templates=nyChildTemplates[input.year],approved=templates?.find(row=>row.id===item.form);
 if(!approved||item.state!=='NY'||typeof loadTemplate!=='function')throw new Error('No reviewed New York child credit annual template is available.');
 const credit=item.empireChildCredit??{},children=credit.children??[];validateChildren(children);
 if(!input.party.name?.trim()||!/^\d{9}$/.test(identifier(input.party.taxId)))throw new Error('New York child credit filer identity must be complete.');
 const joint=input.individual.filingStatus==='marriedJoint';
 if(joint&&(!input.individual.spouseName?.trim()||!/^\d{9}$/.test(identifier(input.individual.spouseTaxId))))throw new Error('New York child credit spouse identity must be complete.');
 const names=input.party.name+(joint?' & '+input.individual.spouseName:''),auditFields=[],continuations=[];
 async function original(formId,rows,attachmentIndex=0){
  const pin=templates.find(row=>row.id===formId),bytes=new Uint8Array(await loadTemplate(formId,input.year));
  if(bytes.length!==pin.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==pin.sha256)throw new Error('The New York child credit form failed its pinned integrity check.');
  const pdf=await PDFDocument.load(bytes),form=pdf.getForm(),font=await pdf.embedFont(StandardFonts.Helvetica);
  if(pdf.getPageCount()!==pin.pages||form.getFields().length!==pin.fieldCount||pdf.getPages().some(page=>page.getWidth()!==612||page.getHeight()!==792||page.getRotation().angle!==0))throw new Error('The New York child credit form structure changed.');
  const attachment=formId==='nyit213att';
  if(rows.length>(attachment?17:6))throw new Error('Too many children for the original New York child credit page.');
  function set(name,value,line=name){
   if(value===null||value===undefined||value==='')return;
   const field=form.getTextField(name),text=String(value),widgets=field.acroField.getWidgets();if(/[\r\n]/.test(text))throw new Error('A New York child credit box requires a single source line.');
   const width=Math.min(...widgets.map(w=>w.getRectangle().width))-3,height=Math.min(...widgets.map(w=>w.getRectangle().height));let size=Math.min(10,height-2);
   while(size>6&&font.widthOfTextAtSize(text,size)>width)size-=.25;
   if(size<6||font.widthOfTextAtSize(text,size)>width||field.getMaxLength()&&text.length>field.getMaxLength())throw new Error(`New York child credit ${name} cannot fit the original value; no truncation was exported.`);
   field.setText(text);field.setFontSize(size);auditFields.push({form:formId,attachmentIndex,reference:name,line});
  }
  function choice(name,value,line){
   if(value===null||value===undefined)return;if(typeof value!=='boolean')throw new Error('New York child credit question evidence must be boolean.');
   const field=form.getCheckBox(name),widgets=field.acroField.getWidgets(),wanted=value?'Yes':'No',matches=widgets.filter(w=>w.getOnValue()?.decodeText()===wanted);
   if(matches.length!==1)throw new Error(`New York child credit ${name} has no unique reviewed ${wanted} choice.`);
   const selected=matches[0],on=selected.getOnValue();field.acroField.dict.set(PDFName.of('V'),on);widgets.forEach(w=>w.setAppearanceState(w===selected?on:PDFName.of('Off')));auditFields.push({form:formId,checkbox:name,line,choice:wanted});
  }
  if(attachment){set('Name Shown on Return',names,'taxpayerNames');set('Your SSN',identifier(input.party.taxId),'taxpayerId');}
  else if(input.year===2025){set('Page 1 Zone 6',names,'taxpayerNames');set('Page 1 Zone 8',identifier(input.party.taxId),'taxpayerId');}
  else{set('Your last name',input.party.name,'taxpayerName');set('Your SSN',identifier(input.party.taxId),'taxpayerId');if(joint){set("Spouse's last name",input.individual.spouseName,'spouseName');set("Spouse's SSN",identifier(input.individual.spouseTaxId),'spouseId');}}
  if(!attachment){
   for(const [line,value]of Object.entries(item.lines??{})){
    const name=nyChildMoneyMaps[input.year][line];if(!name)throw new Error(`New York child credit line ${line} has no reviewed monetary mapping.`);
    if(value===null||value===undefined)continue;if(!Number.isSafeInteger(value))throw new Error('New York child credit amounts must be known integer cents.');set(name,String(wholeDollars(value)/100),line);
   }
   for(const [line,value]of Object.entries(credit.counts??{})){
    const name=nyChildCountMaps[input.year][line];if(!name)throw new Error(`New York child credit count ${line} has no reviewed mapping.`);
    if(value===null||value===undefined)continue;if(!Number.isInteger(value)||value<0||value>100)throw new Error('New York child credit counts must be known bounded integers.');set(name,value,`count:${line}`);
   }
   for(const [line,value]of Object.entries(credit.flags??{})){if(input.year===2025||!['1','2','3'].includes(line))throw new Error('New York child credit question has no reviewed annual mapping.');choice(`Line ${line}`,value,`question:${line}`);}
  }
  rows.forEach((row,index)=>{for(const [key,name]of Object.entries(nyChildRowMap(input.year,index,attachment)))set(name,key==='taxId'?identifier(row[key]):key==='dateOfBirth'?birth(row[key]):row[key],`child${index+1}:${key}`);});
  form.updateFieldAppearances(font);form.flatten();
  for(const key of ['OpenAction','AA','Names'])pdf.catalog.delete(PDFName.of(key));for(const page of pdf.getPages())for(const key of ['Annots','AA'])page.node.delete(PDFName.of(key));
  return pdf;
 }
 const attachment=item.form==='nyit213att';
 if(attachment&&children.length>17)throw new Error('A standalone New York attachment holds at most seventeen children.');
 const pdf=await original(item.form,attachment?children:children.slice(0,6));
 if(!attachment)for(let offset=6;offset<children.length;offset+=17){
  const rows=children.slice(offset,offset+17),index=continuations.length+1,appendix=await original('nyit213att',rows,index),pin=templates.find(row=>row.id==='nyit213att');
  for(const page of await pdf.copyPages(appendix,appendix.getPageIndices()))pdf.addPage(page);
  continuations.push({form:'nyit213att',year:input.year,attachmentIndex:index,templateSha256:pin.sha256,firstChild:offset+1,childCount:rows.length});
 }
 return {bytes:await pdf.save({useObjectStreams:false}),audit:{form:item.form,year:input.year,copyId:item.copyId,templateSha256:approved.sha256,fields:auditFields,childCount:children.length,continuationPages:continuations.length,continuations}};
}

export function nyChildWorkpaper(input,result,line){
 const credit=result.states?.find(row=>row.state==='NY')?.empireChildCredit;if(!credit)return;
 line('New York Empire State child credit calculation',11);
 line(`Calculated credit: ${credit.amountCents===null?'UNRESOLVED':displayMoney(credit.amountCents)+' USD'}.`);
 for(const [key,value]of Object.entries(credit.counts??{}))line(`IT213 line ${key} child count: ${value===null?'UNRESOLVED':value}.`);
 for(const [key,value]of Object.entries(credit.lines??{}))line(`IT213 line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
 for(const row of credit.children??[])line(`Linked child ${row.id}: ${[row.firstName,row.middleInitial,row.lastName,row.suffix].filter(Boolean).join(' ')}, born ${row.dateOfBirth}; age ${row.age}; timely federal identifier ${row.timelyForFederal===true?'Yes':row.timelyForFederal===false?'No':'Unresolved'}${input.year===2023?`; late identifier ${row.lateIdentifier===true?'Yes':'No'}`:''}.`);
 for(const [name,worksheet]of Object.entries(credit.worksheets??{})){
  const label=name==='federalPayroll'?'New York old-law payroll alternative':`IT213 worksheet ${name}`;
  if(name==='federalPayroll')line('New York old-law payroll alternative from current original sources',11);
  for(const [key,value]of Object.entries(worksheet.lines??{}))line(`${label} line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
  for(const [key,value]of Object.entries(worksheet.counts??{}))line(`${label} line ${key} count: ${value===null?'UNRESOLVED':value}.`);
  for(const [key,value]of Object.entries(worksheet.flags??{}))line(`${label} ${key}: ${value===true?'Yes':value===false?'No':value??'UNRESOLVED'}.`);
 }
 const source=input.individual.stateReturns?.find(row=>row.state==='NY')?.empireChildCredit;
 if(source){line(`Empire child credit source: ${source.source??''}.`);for(const [key,value]of Object.entries(source.review??{}))line(`Empire child credit review ${key}: ${value?'Reviewed':'Unresolved'}.`);}
}
