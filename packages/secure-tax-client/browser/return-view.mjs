import { calculateReturn,displayMoney,scopeNotice } from '@shuug/tax-engine';
const node=(document,tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
export const isTaxReturn=data=>data?.version===1&&data?.type==='tax-return';
export function renderReturn(document,data,{download=null,run=operation=>operation(),isCurrent=()=>true}={}){
  const section=node(document,'section'),result=calculateReturn(data);section.className='tax-return-result';
  section.append(node(document,'h3',`${data.year} Form ${data.kind} draft`),node(document,'p',scopeNotice));
  const state=node(document,'p',`Preparation: ${result.status}. Filing: not transmitted.`);state.setAttribute('role','status');section.append(state);
  const totals=node(document,'dl');totals.className='tax-return-totals';
  for(const [key,value]of Object.entries(result.summary))totals.append(node(document,'dt',key.replace(/Cents$/,'').replace(/([A-Z])/g,' $1').replace(/^./,letter=>letter.toUpperCase())),node(document,'dd',value===null?'Not calculated':`${displayMoney(value)} USD`));section.append(totals);
  const elections=result.earnedIncomeCredit?.electionCandidates??[];
  if(elections.length>1){const review=node(document,'section');review.className='eic-election-results';review.append(node(document,'h4','Combat pay choices for Earned Income Credit'),node(document,'p','Each filer chooses whether to include all of their nontaxable combat pay. Review these calculated amounts, then save each filer’s choice in the EIC source section.'));
    const rows=node(document,'ul');for(const candidate of elections){const choice=Object.entries(candidate.elections).map(([owner,election])=>`${owner==='spouse'?'Spouse':'Taxpayer'}: ${election==='include'?'include':'exclude'} combat pay`).join('; ');rows.append(node(document,'li',`${choice} — EIC ${candidate.amountCents===null?'not calculated':displayMoney(candidate.amountCents)+' USD'}`));}review.append(rows);section.append(review);}
  for(const state of result.states??[]){
    section.append(node(document,'h4',`${state.year} ${state.state} state return`));const values=node(document,'dl');values.className='tax-return-totals';for(const [key,value]of Object.entries(state.summary))values.append(node(document,'dt',key.replace(/Cents$/,'').replace(/([A-Z])/g,' $1')),node(document,'dd',value===null?'Not calculated':`${displayMoney(value)} USD`));section.append(values);
    const candidates=state.state==='NY'?state.earnedIncomeCredit?.noncustodial?.electionCandidates??[]:[];
    if(candidates.length>1){const review=node(document,'section');review.className='ny-eic-election-results';review.append(node(document,'h4','New York noncustodial credit combat-pay choices'),node(document,'p','Review these IT-209 amounts and save each applicable filer’s election in the New York source section. The federal election is saved separately.'));
      const rows=node(document,'ul');for(const candidate of candidates){const choice=Object.entries(candidate.elections).map(([owner,election])=>`${owner==='spouse'?'Spouse':'Taxpayer'}: ${election} combat pay`).join('; ');rows.append(node(document,'li',`${choice} — IT-209 credit ${candidate.amountCents===null?'not calculated':displayMoney(candidate.amountCents)+' USD'}`));}review.append(rows);section.append(review);}
  }
  const diagnostics=node(document,'ul');for(const item of result.diagnostics){const row=node(document,'li',item.message);row.className=item.severity==='blocking'?'tax-blocker':'';diagnostics.append(row);}section.append(diagnostics);
  const details=node(document,'details');details.append(node(document,'summary','Calculation workpapers'));
  for(const item of result.forms){details.append(node(document,'h4',`${item.form.replace(/^f/,'Form ')} · ${item.copyId}`));const lines=node(document,'dl');lines.className='tax-return-totals';for(const [line,value]of Object.entries(item.lines))lines.append(node(document,'dt',`Line ${line}`),node(document,'dd',displayMoney(value)));details.append(lines);}section.append(details);
  if(download&&result.calculationAvailable){const button=node(document,'button',result.annualAvailability?.finalForms.length===0?'Download draft workpapers PDF':'Download draft forms PDF');button.type='button';button.className='secondary';button.addEventListener('click',()=>run(async()=>{
    const captured=structuredClone(data),{generateDraftPdf}=await import('@shuug/tax-engine/pdf');
    if(!isCurrent())throw new Error('The private return view changed. Reopen the current return before exporting.');
    const packet=await generateDraftPdf(captured);
    try{if(!isCurrent())throw new Error('The private return view changed. No readable PDF was downloaded.');await download(`shuug-${captured.year}-${captured.kind}-draft.pdf`,packet.bytes,'application/pdf');}finally{packet.bytes.fill(0);}
  }));section.append(node(document,'p','A requested PDF download creates a readable copy outside this vault. Every page is marked draft; incomplete schedules and unreviewed questions still require completion.'),button);}
  return section;
}
