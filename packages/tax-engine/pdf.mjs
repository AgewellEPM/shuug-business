import {earnedIncomeCreditWorkpaper} from './earned-income-credit.mjs';
import {eicWorkpaper,eicAnnotations} from './eic-pdf.mjs';
import {childCreditWorkpaper,dependentContinuationPdf} from './child-credits-pdf.mjs';
import {schedule1AWorkpaper} from './schedule-1a-pdf.mjs';
import {eligibilityWorkpaper,eligibilityAnnotations} from './eligibility-pdf.mjs';
import {investmentWorkpaper} from './investment-pdf.mjs';
import {capitalWorkpaper} from './capital-pdf.mjs';
import {inventoryWorkpaper} from './inventory-pdf.mjs';
import {retirementWorkpaper,retirementAnnotations} from './retirement-pdf.mjs';
import {ctWorkpaper,renderCTForm} from './state-ct-pdf.mjs';
import {ctEitcWorkpaper,renderCTEitcForm} from './state-ct-eitc-pdf.mjs';
import {ctDependentWorkpaper,renderCTDependentForm} from './state-ct-dependent-pdf.mjs';
import {nyWorkpaper,renderNYForm} from './state-ny-pdf.mjs';
import { PDFDocument, StandardFonts, rgb, degrees, PDFName } from 'pdf-lib';
import { calculateReturn, scopeNotice } from './index.mjs';
import { displayMoney } from './money.mjs';
import { referencedField } from './form-maps.mjs';
import { pdfYearPack } from './form-years.mjs';
import { identityFields } from './pdf-identity.mjs';
import {householdWorkpaper,householdContinuationPdf} from './household-pdf.mjs';
import {energyWorkpaper} from './energy-pdf.mjs';

export const defaultTemplateLoader=async (id,year=2025)=>{
  if(!pdfYearPack(year).templates.some(form=>form.id===id))throw new Error('Unknown official form.');
  const response=await fetch(new URL(`./forms/${year}/${id}.pdf`,import.meta.url),{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('The bundled official form could not be loaded.');return new Uint8Array(await response.arrayBuffer());
};
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
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
  line('SHUUG DRAFT - DO NOT FILE',18);line(`${input.year} federal Form ${input.kind} preparation`);line(scopeNotice);line(result.annualAvailability?.finalForms.length===0?'This packet contains calculation workpapers only. No final annual return templates are installed; line references do not establish the final form layout. No return has been filed.':'This packet contains partially populated official forms and calculation workpapers. Blank questions, signatures and unimplemented schedules still require completion. No return has been filed.');
  line(`Name in the source workpaper: ${input.party.name}`);line(`Filing status: ${input.individual?.filingStatus??'Business entity'}`);line(`Calculated from the encrypted return input; status: ${result.status}.`);
  for(const [key,value]of Object.entries(result.summary))line(`${key.replace(/Cents$/,'').replace(/([A-Z])/g,' $1')}: ${displayMoney(value)} USD`);
  line('Preparation diagnostics',14);for(const item of result.diagnostics)line(`${item.severity.toUpperCase()}: ${item.message}`);
  if(result.pdfUnavailableForms?.length)line('Official templates omitted because this annual pack is incomplete: '+result.pdfUnavailableForms.join(', ')+'. The calculation fields below are workpapers, not finalized form line assignments.');
  for(const item of result.forms.filter(item=>result.pdfUnavailableForms?.includes(item.form))){line(`${item.form} calculation workpaper`,12);for(const [key,value]of Object.entries(item.lines))line(`${key}: ${displayMoney(value)} USD`);}
  const businesses=input.individual?.businesses??[input.entity];
  for(const business of businesses){line(`Deduction workpaper: ${business.name??business.businessName??'Business'}`,12);for(const expense of business.expenses)line(`${expense.category}: ${displayMoney(expense.amountCents)} USD. ${expense.description}`);}
  if(input.notes){line('Preparation notes',12);line(input.notes);}
  earnedIncomeCreditWorkpaper(input,result,line);eicWorkpaper(input,result,line);childCreditWorkpaper(input,result,line);schedule1AWorkpaper(input,result,line);eligibilityWorkpaper(input,line,result);energyWorkpaper(input,line);householdWorkpaper(input,line);investmentWorkpaper(input,line);capitalWorkpaper(input,line,result);retirementWorkpaper(input,line,result);inventoryWorkpaper(input,result,line);ctWorkpaper(input,result,line);ctEitcWorkpaper(input,result,line);ctDependentWorkpaper(input,result,line);nyWorkpaper(input,result,line);
}

/** All calculation and rendering happen in the trusted caller. The loader only
 * receives public form IDs; the default fetch reads pinned same-origin blanks. */
export async function generateDraftPdf(input,{loadTemplate=defaultTemplateLoader}={}){
  const original=structuredClone(input),result=calculateReturn(original);
  if(!result.calculationAvailable)throw new Error('Correct the return input and install its declared tax-year pack before exporting forms.');
  const {templates,lineMaps,scheduleMaps}=pdfYearPack(original.year);
  const output=await PDFDocument.create(),font=await output.embedFont(StandardFonts.Helvetica),audit=[];
  workpaper(output,font,original,result);dependentContinuationPdf(output,font,original,result);householdContinuationPdf(output,font,original,result);
  for(const item of result.forms){
    if(result.pdfUnavailableForms?.includes(item.form))continue;
    const stateRenderer={ct1040:renderCTForm,ct1040eitc:renderCTEitcForm,ctdependent:renderCTDependentForm,nyit201:renderNYForm,nyit2:renderNYForm}[item.form];
    if(stateRenderer){
      const rendered=await stateRenderer(original,item,{loadTemplate});
      try{const pdf=await PDFDocument.load(rendered.bytes),firstPage=output.getPageCount()+1;removeActions(pdf);for(const page of await output.copyPages(pdf,pdf.getPageIndices()))output.addPage(page);audit.push({...rendered.audit,firstPage,pageCount:pdf.getPageCount()});}finally{rendered.bytes.fill(0);}continue;
    }
    const approved=templates.find(form=>form.id===item.form);if(!approved||!lineMaps[item.form])throw new Error('An official form has no reviewed annual template/map.');
    const bytes=new Uint8Array(await loadTemplate(item.form,original.year));
    if(bytes.length!==approved.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==approved.sha256)throw new Error('The bundled official form failed its pinned integrity check.');
    const pdf=await PDFDocument.load(bytes),form=pdf.getForm();if(pdf.getPageCount()!==approved.pages||form.getFields().length!==approved.fieldCount)throw new Error('The official form structure changed.');
    const localFont=await pdf.embedFont(StandardFonts.Helvetica),filled=[],set=fieldWriter(form,localFont,filled);
    set.checkbox=name=>{form.getCheckBox(name).check();filled.push({checkbox:name});};
    identityFields(original,item,set);
    for(const [line,value]of Object.entries(item.lines)){if(item.form==='f1040sse'&&line==='7')continue;const reference=lineMaps[item.form][line];if(!reference)throw new Error('A calculated form line has no reviewed PDF field.');set(reference,value===null?null:String(value/100),line);}
    for(const [name,lines]of Object.entries(item.schedules??{}))for(const [line,value]of Object.entries(lines)){const reference=scheduleMaps[item.form]?.[name]?.[line];if(!reference)throw new Error('A calculated schedule line has no reviewed PDF field.');set(reference,value===null?null:String(value/100),`${name}:${line}`);}
    form.updateFieldAppearances(localFont);form.flatten();eligibilityAnnotations(original,item,{pdf,font:localFont,audit:filled});retirementAnnotations(original,item,{pdf,font:localFont,audit:filled});eicAnnotations(original,item,{pdf,font:localFont,audit:filled});removeActions(pdf);
    const firstPage=output.getPageCount()+1;for(const page of await output.copyPages(pdf,pdf.getPageIndices()))output.addPage(page);
    audit.push({form:item.form,copyId:item.copyId,firstPage,pageCount:pdf.getPageCount(),filled});bytes.fill(0);
  }
  for(const page of output.getPages())page.drawText('SHUUG DRAFT - DO NOT FILE',{x:90,y:360,size:30,font,color:rgb(.65,.12,.12),opacity:.18,rotate:degrees(35)});
  output.setTitle(`Shuug ${original.year} Form ${original.kind} draft`);output.setProducer('Shuug local tax preparation');removeActions(output);
  return {bytes:await output.save(),result,audit,omittedForms:result.pdfUnavailableForms??[]};
}
