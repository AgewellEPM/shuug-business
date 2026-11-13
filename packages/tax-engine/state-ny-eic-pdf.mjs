import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib';
import {wholeDollars,displayMoney} from './money.mjs';
import {nyEicTemplates,nyIt215LineMap,nyIt209LineMap,nyIt215QuestionMap,nyIt209QuestionMap} from './state-ny-eic-maps.mjs';

export function nyEicPdfYearPack(year){const templates=nyEicTemplates[year]??[];return {templates,lineMaps:templates.length?{nyit215:nyIt215LineMap,nyit209:nyIt209LineMap}:{},scheduleMaps:{}};}
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const id=value=>String(value??'').replaceAll('-','');
const dollars=value=>{if(!Number.isSafeInteger(value))throw new Error('New York EIC amounts must be known integer cents.');return String(wholeDollars(value)/100);};
function birth(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('New York EIC birth date is incomplete.');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('New York EIC birth date is invalid.');return value.slice(5,7)+value.slice(8,10)+value.slice(0,4);}
const relation=value=>({adoptedChild:'adopted child',stepchild:'stepchild',fosterChild:'foster child',nieceNephew:'niece/nephew',grandchild:'grandchild',child:'child',sibling:'sibling'}[value]??value);

/** Fill and flatten the unchanged annual NY originals. Native checkbox on-values
 * are semantic: IT209 lines7/9 have reversed widget order in all three years. */
export async function renderNYEicForm(input,item,{loadTemplate}={}){
 const approved=nyEicTemplates[input.year]?.find(row=>row.id===item.form);
 if(!approved||item.state!=='NY'||typeof loadTemplate!=='function')throw new Error('No reviewed New York EIC annual template is available.');
 const bytes=new Uint8Array(await loadTemplate(item.form,input.year));
 if(bytes.length!==approved.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==approved.sha256)throw new Error('The New York EIC form failed its pinned integrity check.');
 const pdf=await PDFDocument.load(bytes),form=pdf.getForm();
 if(pdf.getPageCount()!==approved.pages||form.getFields().length!==approved.fieldCount||pdf.getPages().some(page=>page.getWidth()!==612||page.getHeight()!==792||page.getRotation().angle!==0))throw new Error('The New York EIC form structure changed.');
 for(const field of form.getFields())for(const widget of field.acroField.getWidgets()){const r=widget.getRectangle();if(r.width<0||r.height<0)widget.setRectangle({x:Math.min(r.x,r.x+r.width),y:Math.min(r.y,r.y+r.height),width:Math.abs(r.width),height:Math.abs(r.height)});}
 const font=await pdf.embedFont(StandardFonts.Helvetica),fields=[];
 function set(name,value,line=name){
  if(value===null||value===undefined||value==='')return;
  const field=form.getTextField(name),text=String(value),widgets=field.acroField.getWidgets();if(/[\r\n]/.test(text))throw new Error('A New York EIC box requires a single source line.');
  const width=Math.min(...widgets.map(w=>w.getRectangle().width))-3,height=Math.min(...widgets.map(w=>w.getRectangle().height));let size=Math.min(10,height-2);
  while(size>6&&font.widthOfTextAtSize(text,size)>width)size-=.25;
  if(size<6||font.widthOfTextAtSize(text,size)>width||field.getMaxLength()&&text.length>field.getMaxLength())throw new Error(`New York EIC ${name} cannot fit the original value; no truncation was exported.`);
  field.setText(text);field.setFontSize(size);fields.push({reference:name,line});
 }
 function choice(name,value,line=name){
  if(value===null||value===undefined)return;
  const field=form.getCheckBox(name),widgets=field.acroField.getWidgets(),wanted=typeof value==='boolean'?(value?'Yes':'No'):value;
  const matches=widgets.filter(w=>w.getOnValue()?.decodeText()===wanted);if(matches.length!==1)throw new Error(`New York EIC checkbox ${name} has no unique reviewed ${wanted} choice.`);
  const selected=matches[0],on=selected.getOnValue();field.acroField.dict.set(PDFName.of('V'),on);widgets.forEach(w=>w.setAppearanceState(w===selected?on:PDFName.of('Off')));fields.push({checkbox:name,line,choice:wanted});
 }
 function tick(name,value,line=name){if(value===true){const field=form.getCheckBox(name),widgets=field.acroField.getWidgets();if(widgets.length!==1)throw new Error('A New York EIC child checkbox must have one reviewed widget.');const on=widgets[0].getOnValue();if(!on)throw new Error('A New York EIC child checkbox has no on-value.');choice(name,on.decodeText(),line);}else if(value!==false&&value!==null&&value!==undefined)throw new Error('New York EIC child checkbox evidence must be boolean.');}
 const eic=item.eic??{},is215=item.form==='nyit215',names=input.party.name+(input.individual.filingStatus==='marriedJoint'?' & '+input.individual.spouseName:'');
 set(is215?'Your last name':'name',names,'taxpayerNames');set(is215?'Your SSN':'ssn1',id(input.party.taxId),'taxpayerId');
 const questionMap=is215?nyIt215QuestionMap:nyIt209QuestionMap;
 for(const [line,name]of Object.entries(questionMap))choice(name,eic.flags?.[line],`question:${line}`);
 const lines=is215?nyIt215LineMap:nyIt209LineMap;
 for(const [line,value]of Object.entries(item.lines??{})){if(value===null||value===undefined)continue;if(!lines[line])throw new Error(`New York EIC line ${line} has no reviewed money mapping.`);set(lines[line],dollars(value),line);}
 set(is215?'8 ein15':'ln15 ein',id(is215?eic.businessIdentifier:eic.noncustodial?.businessIdentifier??eic.businessIdentifier),'businessIdentifier');
 if(is215){for(const [line,value]of Object.entries(eic.worksheetB?.lines??{})){if(!['1','2','3','4','5'].includes(line))throw new Error('New York EIC Worksheet B line is not reviewed.');if(value!==null&&value!==undefined)set(`Worksheet B ${line} dollars15`,dollars(value),`worksheetB:${line}`);}}
 else{
  if(eic.flags?.profit===true&&eic.flags?.loss===true)throw new Error('New York IT209 business amount cannot be both profit and loss.');
  if(eic.flags?.profit===true)choice('15','Profit','15:profit');else if(eic.flags?.loss===true)choice('15','Loss','15:loss');
  // The 2023 original has an unused editable field over its already printed
  // .30 rate. Leave it empty so flattening cannot duplicate the fixed amount.
 }
 const children=eic.children??[],ncChildren=is215?[]:eic.noncustodial?.children??[];
 if(!Array.isArray(children)||!Array.isArray(ncChildren)||children.length>100||ncChildren.length>100)throw new Error('New York EIC child sources exceed the reviewed limit.');
 function validateChild(row,months=false){if(!row.firstName?.trim()||!row.lastName?.trim()||!/^\d{9}$/.test(id(row.taxId))||!row.relationship)throw new Error('New York EIC child identity must be complete.');birth(row.dateOfBirth);if(months&&(!Number.isInteger(row.usHomeMonths)||row.usHomeMonths<1||row.usHomeMonths>12))throw new Error('New York EIC requires actual reviewed calendar months.');}
 for(const [index,row]of children.entries()){
  validateChild(row,true);if(index>=3)continue;const n=index+1,prefix=`child${n}`;
  for(const [name,value]of Object.entries({[`ln34fn${n}`]:row.firstName,[`ln34mi${n}`]:row.middleInitial,[`ln34ln${n}`]:row.lastName,[`ln34suf${n}`]:row.suffix,[`ln34real${n}`]:relation(row.relationship),[`month${n}`]:row.usHomeMonths,[`ln34ssn${n}`]:id(row.taxId),[`ln34birth${n}`]:birth(row.dateOfBirth)}))set(name,value,`${prefix}:${name}`);
  const ageBranch=!(row.age<19&&row.younger===true);
  tick(`ln34student${n}`,ageBranch&&row.studentYounger===true,`${prefix}:student`);
  tick(`ln34disability${n}`,ageBranch&&row.studentYounger!==true&&row.disabled===true,`${prefix}:disabled`);
 }
 for(const [index,row]of ncChildren.entries()){
  validateChild(row);if(index>=3)continue;const n=index+1;
  for(const [name,value]of Object.entries({[`fn${n}`]:row.firstName,[`mi${n}`]:row.middleInitial,[`last${n}`]:row.lastName,[`suf${n}`]:row.suffix,[`relation${n}`]:relation(row.relationship),[`ssn${n+2}`]:id(row.taxId),[`birth${n}`]:birth(row.dateOfBirth)}))set(name,value,`noncustodialChild${n}:${name}`);
 }
 form.updateFieldAppearances(font);form.flatten();
 // Additional federal Schedule EIC children have an express separate-statement
 // instruction. Noncustodial line3 asks for up to three; all source records are
 // retained in the private calculation workpaper, not silently removed.
 if(children.length>3){let page,top=800;
  function text(value,y,size=10){const content=String(value);if(/[\r\n]/.test(content)||font.widthOfTextAtSize(content,size)>540)throw new Error('New York EIC continuation cannot fit the complete source value.');page.drawText(content,{x:36,y:792-y,size,font});}
  children.slice(3).forEach((row,index)=>{if(top+80>740){page=pdf.addPage([612,792]);text(`${input.year} ${is215?'IT-215 line4':'IT-209 line34'} - qualifying-child continuation`,40,12);text(names,62);text(`Taxpayer SSN: ${id(input.party.taxId)}`,82);top=115;}
   const ageBranch=!(row.age<19&&row.younger===true),student=ageBranch&&row.studentYounger===true,disabled=ageBranch&&row.studentYounger!==true&&row.disabled===true;
   text(`Child ${index+4}: ${[row.firstName,row.middleInitial,row.lastName,row.suffix].filter(Boolean).join(' ')}`,top);text(`SSN: ${id(row.taxId)}; date of birth: ${birth(row.dateOfBirth)}; relationship: ${relation(row.relationship)}`,top+20);text(`Months: ${row.usHomeMonths}; federal student box marked: ${student?'Yes':'No'}; disability box marked: ${disabled?'Yes':'No'}`,top+40);top+=80;
  });
 }
 for(const key of ['OpenAction','AA','Names'])pdf.catalog.delete(PDFName.of(key));for(const page of pdf.getPages())for(const key of ['Annots','AA'])page.node.delete(PDFName.of(key));
 return {bytes:await pdf.save({useObjectStreams:false}),audit:{form:item.form,year:input.year,copyId:item.copyId,templateSha256:approved.sha256,fields,continuationPages:pdf.getPageCount()-approved.pages,childCount:children.length,noncustodialChildCount:ncChildren.length,noncustodialPrintedCount:Math.min(ncChildren.length,3)}};
}

export function nyEicWorkpaper(input,result,line){
 const state=result.states?.find(row=>row.state==='NY'),eic=state?.earnedIncomeCredit;if(!eic)return;
 line('New York earned income credit calculations',11);
 for(const [key,value]of Object.entries(eic))if(key.endsWith('Cents'))line(`${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
 if(eic.worksheetA)for(const [key,value]of Object.entries(eic.worksheetA.lines))line(`IT215 Worksheet A line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
 if(eic.worksheetB)for(const [key,value]of Object.entries(eic.worksheetB.lines))line(`IT215 Worksheet B line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
 if(eic.cityWorksheet){const worksheet=eic.cityWorksheet;for(const [key,value]of Object.entries(worksheet.worksheetCLines??{}))line(`NYC credit worksheet line ${key}: ${value===null?'UNRESOLVED':key==='2'?(value/10000).toFixed(4):displayMoney(value)+' USD'}.`);if(worksheet.rateBasisPoints!==undefined)line(`NYC credit rate: ${worksheet.rateBasisPoints/100}%.`);for(const [key,value]of Object.entries(worksheet.rateLines??{}))line(`NYC rate worksheet ${key}: ${value===null?'Not required for this income band':Number(key)<=3?displayMoney(value)+' USD':(value/10000).toFixed(4)}.`);}
 if(eic.noncustodial){line('Noncustodial source records and calculated credit',11);for(const row of eic.noncustodial.children??[])line(`Linked child ${row.id}: ${row.firstName} ${row.lastName}, born ${row.dateOfBirth}, relationship ${row.relationship}.`);for(const [key,value]of Object.entries(eic.noncustodial.lines??{}))line(`IT209 line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
  for(const [worksheet,entries]of Object.entries(eic.noncustodial.incomeWorksheet??{}))for(const [key,value]of Object.entries(entries))line(`IT209 income Worksheet ${worksheet.toUpperCase()} line ${key}: ${value===null?'UNRESOLVED':displayMoney(value)+' USD'}.`);
  const source=input.individual.stateReturns?.find(row=>row.state==='NY')?.earnedIncomeCredit?.noncustodial;
  if(source){line(`Claimant: ${source.claimant}; child-source review: ${source.review.children}; order-source review: ${source.review.orders}; source: ${source.source}.`);for(const order of source.orders??[])line(`Support order ${order.id}: children ${order.childIds.join(', ')}; effective ${order.effectiveFrom} to ${order.effectiveThrough}; through New York SCU: ${order.throughNYSCU}; current due ${displayMoney(order.currentSupportDueCents)} USD; paid ${displayMoney(order.currentSupportPaidCents)} USD; source ${order.source}; reviewed ${order.reviewed}.`);}
  for(const candidate of eic.noncustodial.electionCandidates??[])line(`Noncustodial combat election ${JSON.stringify(candidate.elections)}: included ${displayMoney(candidate.combatPayCents)} USD; earned income ${displayMoney(candidate.earnedIncomeCents)} USD; calculated credit ${displayMoney(candidate.amountCents)} USD.`);
  if(eic.noncustodial.selectedElection)line(`Saved noncustodial combat election: ${JSON.stringify(eic.noncustodial.selectedElection.elections)}.`);
 }
}
