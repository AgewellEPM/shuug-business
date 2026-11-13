import {BOOK_CLASSES,DEFAULT_BOOK_ACCOUNTS,replayCaseBooks} from '../case-books.mjs';
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
export function parseBookAmount(value){
  if(value==='')return 0;if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))throw new Error('Enter a nonnegative USD amount with at most two decimal places.');
  const [whole,fraction='']=value.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(cents>99999999999)throw new Error('This amount exceeds the supported journal limit.');return cents;
}
const reference=record=>({objectId:record.objectId,revision:record.revision,envelopeDigest:record.envelopeDigest,domain:record.domain});
export function drawCaseBookAction(document,form,{type,body,field,records,onDirty,idPrefix='case',initialBook=null}){
  const book=initialBook??replayCaseBooks(body.history,body.year),notes=()=>field('Client-visible ledger note (encrypted)','books-notes',{type:'textarea'});
  if(type==='books.open'){
    const title=field('Working ledger title','books-title',{maximum:160});title.value=`${body.title} books`.slice(0,160);
    const from=field('Ledger start','books-from',{type:'date'}),through=field('Ledger end','books-through',{type:'date'});from.value=`${body.year}-01-01`;through.value=`${body.year}-12-31`;
    form.append(node(document,'p','USD case working ledger. Opening a ledger does not import or merge older books. Starting accounts: Bank, Accounts receivable, Accounts payable, Owner equity, Income, Cost of goods sold and Operating expenses. Review and post opening balances separately.'));
    const note=notes();return {readInput:()=>({title:title.value.trim(),currency:'USD',from:from.value,through:through.value,accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:note.value}),evidenceId:()=>null};
  }
  if(!book)throw new Error('Open the selected case ledger first.');
  if(type==='books.account.add'){
    const number=field('New account number','books-account-number'),name=field('Account name','books-account-name',{maximum:150}),classification=field('Account classification','books-account-class',{options:Object.keys(BOOK_CLASSES).map(value=>[value,value.replaceAll('_',' ')])}),note=notes();
    return {readInput:()=>{if(!/^[1-9]\d{0,8}$/.test(number.value))throw new Error('Enter an unused account number of 1–9 digits.');return {account:{number:Number(number.value),name:name.value.trim(),classification:classification.value},notes:note.value};},evidenceId:()=>null};
  }
  if(type==='books.period.close'){
    const through=field('Close ledger through','books-close-through',{type:'date'});form.append(node(document,'p','After firm approval, no journal or reversal can use this date or an earlier date. The lock can only advance. Later adjustments retain their actual posting date.'));const note=notes();
    return {readInput:()=>({through:through.value,notes:note.value}),evidenceId:()=>null};
  }
  const date=field('Journal date','books-date',{type:'date'});
  if(type==='books.journal.reverse'){
    const entry=field('Original journal to reverse','books-entry',{options:[['','Choose an unreversed original journal'],...book.entries.filter(item=>!item.reverses&&!book.entries.some(other=>other.reverses===item.id)).map(item=>[item.id,`${item.date} · ${item.memo}`])]}),reason=field('Reason for reversal','books-reason',{maximum:1000}),note=notes();
    form.append(node(document,'p','The original posting remains in history. Approval adds a matching opposite journal on the selected open date.'));
    return {readInput:()=>({entryId:entry.value,date:date.value,reason:reason.value.trim(),notes:note.value}),evidenceId:()=>null};
  }
  const memo=field('Journal description','books-memo',{maximum:1000}),choices=[['','No attached file — explain the basis in the note']];
  for(const record of records.values()){
    if(!['tax-document','driver-receipt'].includes(record.domain)||!record.envelopeDigest)continue;
    try{const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(record.plaintext));if(payload.version===1&&payload.type==='private-file')choices.push([record.objectId,`${payload.filename} · revision ${record.revision}`]);}catch{}
  }
  const evidence=field('Supporting opened file','books-document',{options:choices}),rows=node(document,'div');rows.className='case-book-lines';form.append(rows);const inputs=[];
  function addLine(){
    const index=inputs.length+1,row=node(document,'fieldset');row.append(node(document,'legend',`Journal line ${index}`));
    const account=node(document,'select'),debit=node(document,'input'),credit=node(document,'input');account.id=`${idPrefix}-books-line-${index}-account`;debit.id=`${idPrefix}-books-line-${index}-debit`;credit.id=`${idPrefix}-books-line-${index}-credit`;
    const active=book.accounts.filter(item=>item.active!==false);for(const item of active){const option=node(document,'option',`${item.number} · ${item.name}`);option.value=String(item.number);account.append(option);}account.value=String(active[Math.min(index-1,active.length-1)]?.number??'');
    for(const input of [debit,credit]){input.type='text';input.inputMode='decimal';input.placeholder='0.00';input.maxLength=12;}
    for(const [label,input]of [['Account',account],['Debit USD',debit],['Credit USD',credit]]){const caption=node(document,'label',label);caption.htmlFor=input.id;row.append(caption,input);}rows.append(row);inputs.push({account,debit,credit});
  }
  addLine();addLine();const add=node(document,'button','Add journal line');add.type='button';form.append(add);
  add.addEventListener('click',()=>{if(inputs.length>=100)return;addLine();add.disabled=inputs.length>=100;onDirty();});
  form.append(node(document,'p','Enter one debit or credit per line. Leave unused added lines blank. Total debits must equal credits. Approval posts this journal; it does not calculate deductions or change the draft return.'));
  const note=notes();
  return {readInput:()=>{const selected=evidence.value?records.get(evidence.value):null;if(evidence.value&&!selected)throw new Error('Reopen the selected supporting file.');return {date:date.value,memo:memo.value.trim(),lines:inputs.filter(row=>row.debit.value!==''||row.credit.value!=='').map(row=>({accountNumber:Number(row.account.value),debitCents:parseBookAmount(row.debit.value),creditCents:parseBookAmount(row.credit.value)})),document:selected?reference(selected):null,notes:note.value};},evidenceId:()=>evidence.value||null};
}
