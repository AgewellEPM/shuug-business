// Private case working ledger. Only certified case history is authoritative.
// No storage, network, tax computation or write authority lives in this module.
export const BOOK_ACTIONS=['books.open','books.account.add','books.journal.post','books.journal.reverse','books.period.close'];
export const BOOK_CLASSES={bank:'asset',receivable:'asset',current_asset:'asset',fixed_asset:'asset',other_asset:'asset',payable:'liability',credit_card:'liability',current_liability:'liability',long_term_liability:'liability',equity:'equity',income:'income',other_income:'income',cogs:'cogs',expense:'expense',other_expense:'expense'};
export const DEFAULT_BOOK_ACCOUNTS=[{number:1000,name:'Bank',classification:'bank'},{number:1200,name:'Accounts receivable',classification:'receivable'},{number:2000,name:'Accounts payable',classification:'payable'},{number:3000,name:'Owner equity',classification:'equity'},{number:4000,name:'Income',classification:'income'},{number:5000,name:'Cost of goods sold',classification:'cogs'},{number:6000,name:'Operating expenses',classification:'expense'}];
const fail=message=>{throw new Error(message??'The private case ledger command or history is invalid.');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail();};
const text=(value,max,required=true)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail();};
const identifier=value=>{if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)fail();};
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)fail();return value;}
function account(value){exact(value,['number','name','classification']);if(!Number.isSafeInteger(value.number)||value.number<1||value.number>999999999||!Object.hasOwn(BOOK_CLASSES,value.classification))fail();text(value.name,150);}
const sum=(a,b)=>{const value=a+b;if(!Number.isSafeInteger(value))fail('The ledger exceeds exact integer bounds. No rounded balance was substituted.');return value;};
function lines(value){
  if(!Array.isArray(value)||value.length<2||value.length>100)fail('A journal needs 2–100 balanced account lines.');
  let debit=0,credit=0;const seen=new Set();
  for(const line of value){exact(line,['accountNumber','debitCents','creditCents']);if(!Number.isSafeInteger(line.accountNumber)||line.accountNumber<1||line.accountNumber>999999999||seen.has(line.accountNumber))fail('Use each account once per journal.');seen.add(line.accountNumber);
    for(const amount of [line.debitCents,line.creditCents])if(!Number.isSafeInteger(amount)||amount<0||amount>99999999999)fail('Enter nonnegative exact cents within the supported amount limit.');
    if((line.debitCents>0)===(line.creditCents>0))fail('Each line needs either a debit or a credit.');debit=sum(debit,line.debitCents);credit=sum(credit,line.creditCents);
  }if(debit!==credit)fail('Journal debits and credits must balance exactly.');
}
export function assertBookInput(type,input){
  if(!BOOK_ACTIONS.includes(type))fail();
  if(type==='books.open'){
    exact(input,['title','currency','from','through','accounts','notes']);text(input.title,160);text(input.notes,2000,false);date(input.from);date(input.through);
    if(input.currency!=='USD'||input.from>input.through||!Array.isArray(input.accounts)||!input.accounts.length||input.accounts.length>100)fail();
    const seen=new Set();for(const item of input.accounts){account(item);if(seen.has(item.number))fail('Account numbers must be unique.');seen.add(item.number);}
  }
  if(type==='books.account.add'){exact(input,['account','notes']);account(input.account);text(input.notes,2000,false);}
  if(type==='books.journal.post'){
    exact(input,['date','memo','lines','document','notes']);date(input.date);text(input.memo,1000);text(input.notes,2000,false);lines(input.lines);
    // The enclosing case validates and authenticates any selected reference.
    if(input.document!==null&&(!input.document||typeof input.document!=='object'))fail();
  }
  if(type==='books.journal.reverse'){exact(input,['entryId','date','reason','notes']);identifier(input.entryId);date(input.date);text(input.reason,1000);text(input.notes,2000,false);}
  if(type==='books.period.close'){exact(input,['through','notes']);date(input.through);text(input.notes,2000);}
  return input;
}
function postingDate(book,value){if(value<book.from||value>book.through)fail('The journal date must fall within this case ledger period.');if(book.closedThrough&&value<=book.closedThrough)fail('This ledger period is closed. Use a later open date for an adjustment.');}
export function replayCaseBooks(history,year){
  let book=null;
  for(const event of history){
    if(!BOOK_ACTIONS.includes(event.type))continue;const input=assertBookInput(event.type,event.input);
    if(event.type==='books.open'){
      if(book)fail('This case already has a working ledger.');if(input.from.slice(0,4)!==String(year)||input.through.slice(0,4)!==String(year))fail('Use dates within the case tax year.');
      book={title:input.title,currency:input.currency,from:input.from,through:input.through,accounts:structuredClone(input.accounts),entries:[],closedThrough:null,version:event.actionId};
    }else{
      if(!book)fail('Open this case’s working ledger first.');
      if(event.type==='books.account.add'){if(book.accounts.length>=100||book.accounts.some(item=>item.number===input.account.number))fail('Choose an unused account number; at most 100 accounts are supported.');book.accounts.push(structuredClone(input.account));}
      if(event.type==='books.journal.post'){
        postingDate(book,input.date);if(input.lines.some(line=>!book.accounts.some(item=>item.number===line.accountNumber)))fail('Every journal line must use an existing account.');
        book.entries.push({id:event.actionId,date:input.date,memo:input.memo,lines:structuredClone(input.lines),document:structuredClone(input.document),reverses:null,actor:event.actor,at:event.at});
      }
      if(event.type==='books.journal.reverse'){
        postingDate(book,input.date);const original=book.entries.find(entry=>entry.id===input.entryId);
        if(!original||original.reverses||book.entries.some(entry=>entry.reverses===original.id)||input.date<original.date)fail('Choose an unreversed original journal and a date on or after its posting.');
        book.entries.push({id:event.actionId,date:input.date,memo:input.reason,lines:original.lines.map(line=>({accountNumber:line.accountNumber,debitCents:line.creditCents,creditCents:line.debitCents})),document:structuredClone(original.document),reverses:original.id,actor:event.actor,at:event.at});
      }
      if(event.type==='books.period.close'){
        if(input.through<book.from||input.through>book.through||book.closedThrough&&input.through<=book.closedThrough)fail('The closing date must advance within this case ledger period.');book.closedThrough=input.through;
      }
      book.version=event.actionId;
    }
  }
  if(book)caseBookReport(book);return book;
}
/** Balance sheet includes opening activity; income includes the selected range.
 * This is ledger timing, with no cash/accrual or deductible-tax claim. */
export function caseBookReport(book,{from=book.from,through=book.through}={}){
  date(from);date(through);if(from<book.from||through>book.through||from>through)fail('Choose a report range within this ledger period.');
  const rows=book.accounts.map(item=>({...item,type:BOOK_CLASSES[item.classification],debitCents:0,creditCents:0,activityDebitCents:0,activityCreditCents:0})),byNumber=new Map(rows.map(row=>[row.number,row]));
  let entryCount=0;
  for(const entry of book.entries){if(entry.date>through)continue;entryCount++;for(const line of entry.lines){const row=byNumber.get(line.accountNumber);if(!row)fail();row.debitCents=sum(row.debitCents,line.debitCents);row.creditCents=sum(row.creditCents,line.creditCents);if(entry.date>=from){row.activityDebitCents=sum(row.activityDebitCents,line.debitCents);row.activityCreditCents=sum(row.activityCreditCents,line.creditCents);}}}
  const totals={debitCents:0,creditCents:0,assetsCents:0,liabilitiesCents:0,equityCents:0,incomeCents:0,cogsCents:0,expenseCents:0,unclosedIncomeCents:0,bankCents:0,receivableCents:0,payableCents:0};
  for(const row of rows){const debit=sum(row.debitCents,-row.creditCents),activity=sum(row.activityDebitCents,-row.activityCreditCents);row.balanceCents=['asset','expense','cogs'].includes(row.type)?debit:-debit;
    totals.debitCents=sum(totals.debitCents,Math.max(0,debit));totals.creditCents=sum(totals.creditCents,Math.max(0,-debit));
    if(row.type==='asset')totals.assetsCents=sum(totals.assetsCents,debit);if(row.type==='liability')totals.liabilitiesCents=sum(totals.liabilitiesCents,-debit);if(row.type==='equity')totals.equityCents=sum(totals.equityCents,-debit);
    if(['income','cogs','expense'].includes(row.type)){totals.unclosedIncomeCents=sum(totals.unclosedIncomeCents,-debit);const key={income:'incomeCents',cogs:'cogsCents',expense:'expenseCents'}[row.type];totals[key]=sum(totals[key],row.type==='income'?-activity:activity);}
    for(const [classification,key]of [['bank','bankCents'],['receivable','receivableCents'],['payable','payableCents']])if(row.classification===classification)totals[key]=sum(totals[key],row.balanceCents);
  }
  const netIncomeCents=sum(sum(totals.incomeCents,-totals.cogsCents),-totals.expenseCents),balanced=totals.debitCents===totals.creditCents&&totals.assetsCents===sum(sum(totals.liabilitiesCents,totals.equityCents),totals.unclosedIncomeCents);if(!balanced)fail('The case ledger does not balance.');
  return {source:'certified-case-ledger',basis:'ledger',currency:book.currency,from,through,entryCount,rows,...totals,netIncomeCents,balanced};
}
export function caseBookCsv(report){
  const cell=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['Shuug case working ledger','USD','Ledger timing'],['From',report.from,'Through',report.through],['Account','Name','Classification','Debit cents','Credit cents'],...report.rows.map(row=>[row.number,row.name,row.classification,Math.max(0,row.debitCents-row.creditCents),Math.max(0,row.creditCents-row.debitCents)]),['Total','','',report.debitCents,report.creditCents]];
  return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
