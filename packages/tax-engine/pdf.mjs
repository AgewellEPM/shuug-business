import { PDFDocument, StandardFonts, rgb, degrees, PDFName } from 'pdf-lib';
import { calculateReturn, scopeNotice } from './index.mjs';
import { displayMoney } from './money.mjs';
import { lineMaps, scheduleMaps, referencedField } from './form-maps.mjs';
import { officialForms2025 } from './forms/2025/templates.mjs';

export const defaultTemplateLoader=async id=>{
  const response=await fetch(new URL(`./forms/2025/${id}.pdf`,import.meta.url),{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('The bundled official form could not be loaded.');return new Uint8Array(await response.arrayBuffer());
};
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const digits=value=>value.replaceAll('-','');
function fieldWriter(form,font,audit){
  return (reference,value,line=null)=>{
    if(value===null||value===undefined||value==='')return;
    const field=referencedField(form,reference),text=String(value),rect=field.acroField.getWidgets()[0].getRectangle();
    const rows=text.split('\n');let size=Math.min(10,(rect.height-4)/rows.length);
    // Reject unsupported glyphs/overflow instead of losing identity or digits.
    while(size>6&&rows.some(row=>font.widthOfTextAtSize(row,size)>rect.width-4))size-=0.25;
    if(size<6||rows.some(row=>font.widthOfTextAtSize(row,size)>rect.width-4))throw new Error('An official form field cannot fit the original text or amount. Review the source; no truncated value was exported.');
    if(rows.length>1)field.enableMultiline();
    field.setText(text);field.setFontSize(size);audit.push({reference,line});
  };
}
function identityFields(input,item,set){
  const p=input.party,person=item.owner==='spouse'?{name:input.individual.spouseName,taxId:input.individual.spouseTaxId}:p;
  if(item.form==='f1040'){
    set('1/14',p.firstName);set('1/15',p.lastName);set('1/16',digits(p.taxId));
    if(input.individual.filingStatus==='marriedJoint'){set('1/17',input.individual.spouseFirstName);set('1/18',input.individual.spouseLastName);set('1/19',digits(input.individual.spouseTaxId));}
    set('1/20',p.street);set('1/22',p.city);set('1/23',p.state);set('1/24',p.zip);
    const status=input.individual.filingStatus,left=['single','marriedJoint','marriedSeparate'].indexOf(status),reference=left>=0?`Checkbox_ReadOrder[0].c1_8[${left}]`:`c1_8[${status==='headOfHousehold'?0:1}]`;
    const checkbox=`topmostSubform[0].Page1[0].${reference}`;set.checkbox(checkbox);
  }else if(['f1040s1','f1040s2','f8995','f1040sse','f1040sc'].includes(item.form)){
    set('1/1',person.name);set('1/2',digits(person.taxId));
    if(item.form==='f1040sc'){const business=input.individual.businesses.find(value=>value.id===item.copyId);set('1/3',business.name);set('1/4',business.businessCode);set('1/5',business.name);set('1/6',digits(business.ein));set('1/7',p.street);set('1/8',[p.city,p.state,p.zip].filter(Boolean).join(', '));}
    if(item.form==='f8995')item.businesses.forEach((business,index)=>{set(`1/${3+index*3}`,business.name);set(`1/${4+index*3}`,digits(business.taxId));set(`1/${5+index*3}`,String(business.qbiCents/100),'business-qbi');});
  }else if(['f1065','f1120s','f1120'].includes(item.form)){
    const partnership=item.form==='f1065';set('1/4',p.name);set('1/5',p.street);set('1/7',p.city);set('1/8',p.state);set('1/10',p.zip);set(partnership?'1/14':item.form==='f1120s'?'1/13':'1/11',digits(p.taxId));
    if(partnership)set('1/13',input.entity.businessCode);else if(item.form==='f1120s')set('1/12',input.entity.businessCode);
    if(item.form!=='f1120')set(partnership?'1/18':'1/16',String(input.entity.owners.length));
  }else{
    const owner=input.entity.owners.find(owner=>owner.id===item.ownerId),partnership=item.form==='f1065sk1';
    set('1/6',digits(p.taxId));set('1/7',[p.name,p.street,[p.city,p.state,p.zip].filter(Boolean).join(', ')].filter(Boolean).join('\n'));
    set(partnership?'1/9':'1/11',digits(owner.taxId));set(partnership?'1/10':'1/12',owner.name);
    if(!partnership)set('1/16',(owner.shareBps/100).toFixed(2));
  }
}
function removeActions(pdf){
  for(const key of ['OpenAction','AA','Names'])pdf.catalog.delete(PDFName.of(key));
  for(const page of pdf.getPages())for(const key of ['Annots','AA'])page.node.delete(PDFName.of(key));
}
function workpaper(pdf,font,input,result){
  let page,y;
  const line=(text,size=10)=>{
    // Preserve source text or reject an unsupported font; never send it to a
    // third-party renderer. Wrap long descriptions within the paper margins.
    const words=String(text).split(/\s+/);let row='';
    const draw=()=>{if(!page||y<45){page=pdf.addPage([612,792]);y=750;}page.drawText(row,{x:36,y,size,font});y-=size+6;};
    for(const word of words){const next=row?`${row} ${word}`:word;if(font.widthOfTextAtSize(next,size)>540&&row){draw();row=word;}else row=next;}draw();
  };
  line('SHUUG DRAFT - DO NOT FILE',18);line(`${input.year} federal Form ${input.kind} preparation`);line(scopeNotice);line('This packet contains partially populated official forms and calculation workpapers. Blank questions, signatures and unimplemented schedules still require completion. No return has been filed.');
  line(`Name in the source workpaper: ${input.party.name}`);line(`Filing status: ${input.individual?.filingStatus??'Business entity'}`);line(`Calculated from the encrypted return input; status: ${result.status}.`);
  for(const [key,value]of Object.entries(result.summary))line(`${key.replace(/Cents$/,'').replace(/([A-Z])/g,' $1')}: ${displayMoney(value)} USD`);
  line('Preparation diagnostics',14);for(const item of result.diagnostics)line(`${item.severity.toUpperCase()}: ${item.message}`);
  const businesses=input.individual?.businesses??[input.entity];
  for(const business of businesses){line(`Deduction workpaper: ${business.name??business.businessName??'Business'}`,12);for(const expense of business.expenses)line(`${expense.category}: ${displayMoney(expense.amountCents)} USD. ${expense.description}`);}
  if(input.notes){line('Preparation notes',12);line(input.notes);}
}

/** All calculation and rendering happen in the trusted caller. The loader only
 * receives public form IDs; the default fetch reads pinned same-origin blanks. */
export async function generateDraftPdf(input,{loadTemplate=defaultTemplateLoader}={}){
  const original=structuredClone(input),result=calculateReturn(original);
  if(!result.calculationAvailable)throw new Error('Correct the return input and install its declared tax-year pack before exporting forms.');
  const output=await PDFDocument.create(),font=await output.embedFont(StandardFonts.Helvetica),audit=[];
  workpaper(output,font,original,result);
  for(const item of result.forms){
    const approved=officialForms2025.find(form=>form.id===item.form);if(!approved||!lineMaps[item.form])throw new Error('An official form has no reviewed 2025 template/map.');
    const bytes=new Uint8Array(await loadTemplate(item.form));
    if(bytes.length!==approved.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==approved.sha256)throw new Error('The bundled official form failed its pinned integrity check.');
    const pdf=await PDFDocument.load(bytes),form=pdf.getForm();if(pdf.getPageCount()!==approved.pages||form.getFields().length!==approved.fieldCount)throw new Error('The official form structure changed.');
    const localFont=await pdf.embedFont(StandardFonts.Helvetica),filled=[],set=fieldWriter(form,localFont,filled);
    set.checkbox=name=>{form.getCheckBox(name).check();filled.push({checkbox:name});};
    identityFields(original,item,set);
    for(const [line,value]of Object.entries(item.lines)){if(item.form==='f1040sse'&&line==='7')continue;const reference=lineMaps[item.form][line];if(!reference)throw new Error('A calculated form line has no reviewed PDF field.');set(reference,value===null?null:String(value/100),line);}
    for(const [name,lines]of Object.entries(item.schedules??{}))for(const [line,value]of Object.entries(lines)){const reference=scheduleMaps[item.form]?.[name]?.[line];if(!reference)throw new Error('A calculated schedule line has no reviewed PDF field.');set(reference,value===null?null:String(value/100),`${name}:${line}`);}
    form.updateFieldAppearances(localFont);form.flatten();removeActions(pdf);
    const firstPage=output.getPageCount()+1;for(const page of await output.copyPages(pdf,pdf.getPageIndices()))output.addPage(page);
    audit.push({form:item.form,copyId:item.copyId,firstPage,pageCount:pdf.getPageCount(),filled});bytes.fill(0);
  }
  for(const page of output.getPages())page.drawText('SHUUG DRAFT - DO NOT FILE',{x:90,y:360,size:30,font,color:rgb(.65,.12,.12),opacity:.18,rotate:degrees(35)});
  output.setTitle(`Shuug ${original.year} Form ${original.kind} draft`);output.setProducer('Shuug local tax preparation');removeActions(output);
  return {bytes:await output.save(),result,audit};
}
