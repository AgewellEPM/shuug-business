import {diagnostic} from './model.mjs';
import {sumMoney,wholeDollars as R,wholeRatio as P} from './money.mjs';
import {nyLegacyPayroll} from './state-ny-child-payroll.mjs';

/** Annual NY Worksheets A/B apply the 2017 $1,000/$3,000 rules. The actual
 * current federal credit determines question2, never the New York credit base. */
export function nyLegacyChildCredit(input,state,federal,source,{children,filersTimely,agi,threshold}){
 const year=input.year,diagnostics=[],need=(condition,code,message)=>{if(!condition)diagnostics.push(diagnostic(code,message));return Boolean(condition);},main=federal.forms?.find(row=>row.form==='f1040')?.lines??{},modern=federal.childCredits,childSource=input.individual.childCredits,counts={},lines={},flags={'1':true},worksheets={},result={known:false,amountCents:null,lines,counts,flags,worksheets,diagnostics};
 const timelyChildren=children.filter(row=>!row.lateIdentifier),lateChildren=children.filter(row=>row.lateIdentifier),count=timelyChildren.length;counts['4']=count;if(year===2023)counts['5']=lateChildren.length;
 need(source.review.foreignBondSources&&source.buildAmericaBondInterest==='none'&&source.magiExclusions==='none','NY_EMPIRE_FOREIGN_BOND_SCOPE','Reconcile Build America Bond interest and the specified Puerto Rico/Form2555/Form4563 exclusions. Positive or unresolved special sources need their original calculations.');
 need(source.review.federalCreditSources&&source.otherCreditTreatments==='none','NY_EMPIRE_FEDERAL_CREDIT_REVIEW','Review the actual federal credit/tax worksheets and absence of unsupported mortgage/adoption/DC/other credit treatments. Supported calculated energy credits remain included.');
 need(!input.features?.length&&childSource?.review.scope&&childSource.review.magi&&childSource.review.otherCredits&&childSource.review.disallowance,'NY_EMPIRE_FEDERAL_SCOPE','Complete existing federal child-credit scope, MAGI, other-credit and prior-disallowance source reviews.');
 need([main['19'],main['28']].every(value=>Number.isSafeInteger(value)&&value>=0)&&main['19']===modern?.nonrefundableCents&&main['28']===modern?.refundableCents,'NY_EMPIRE_FEDERAL_CREDIT_LINK','Reconcile actual claimed federal child/other-dependent and additional child credits to their computed Form1040 lines.');
 if(diagnostics.length)return result;
 const claimed=main['19']>0||main['28']>0,within=R(agi)<=threshold;flags['2']=claimed;flags['3']=within;
 // A late filer cannot lawfully supply a claimed modern federal child credit.
 need(filersTimely||!claimed,'NY_EMPIRE_LATE_FILER_CONFLICT','A late filer identifier conflicts with a positive actual federal child/dependent credit. Reconcile the original timing and return.');if(diagnostics.length)return result;
 const floor=within?children.length*10000:0,ctcLine=year===2023?'6':'5',actcLine=year===2023?'7':'6',sumLine=year===2023?'8':'7',percentLine=year===2023?'9':'8',floorLine=year===2023?'13':'9',totalLine=year===2023?'14':'10';
 if(year===2023&&within)Object.assign(counts,{'10':count,'11':lateChildren.length,'12':children.length});if(within)lines[floorLine]=floor;
 const finish=(ctc,actc)=>{lines[ctcLine]=ctc;lines[actcLine]=actc;lines[sumLine]=ctc===null||actc===null?null:sumMoney([ctc,actc]);lines[percentLine]=lines[sumLine]===null?null:P(lines[sumLine],3300);lines[totalLine]=lines[percentLine]===null?null:Math.max(floor,lines[percentLine]);return {...result,known:lines[totalLine]!==null,amountCents:lines[totalLine]};};
 if(!claimed){lines[percentLine]=0;lines[totalLine]=floor;return {...result,known:true,amountCents:floor};}
 const a=worksheets.a={lines:{'1':count*100000,'2':R(agi),'3':0,'4':R(agi),'5':threshold},flags:{}},al=a.lines;al['6']=agi>threshold?Math.ceil((R(agi)-threshold)/100000)*100000:null;al['7']=al['6']===null?0:P(al['6'],500);al['8']=Math.max(0,al['1']-al['7']);a.flags['6']=al['6']!==null;a.flags['8']=al['8']>0;
 if(al['8']===0)return finish(0,0);
 const schedules=(federal.forms??[]).filter(row=>row.form==='f1040s3'),schedule=schedules[0]?.lines??{},priorityKeys=['1','2','3','4','5b','6d','6f','6l','6m'];need(schedules.length<=1,'NY_EMPIRE_SCHEDULE3_RECONCILIATION','Reconcile one actual federal Schedule3 before using the New York credit limit.');
 const get=key=>Object.hasOwn(schedule,key)?schedule[key]:0,priority=priorityKeys.map(get),named=['5a','6c','6g','6h'].map(get);need([...priority,...named].every(value=>Number.isSafeInteger(value)&&value>=0)&&Number.isSafeInteger(main['18']),'NY_EMPIRE_TAX_LIMIT','Resolve actual federal line18 tax and every referenced Schedule3 credit; explicit null amounts do not become zero.');
 need(['6c','6g','6h'].every(key=>get(key)===0),'NY_EMPIRE_NAMED_CREDIT_SCOPE','Mortgage-interest, adoption and DC homebuyer credits require their additional source integration.');
 if(diagnostics.length)return finish(null,null);
 al['9']=main['18'];al['10']=sumMoney(priority);al['11']=al['10'];
 let payroll;const getPayroll=()=>{if(!payroll){payroll=nyLegacyPayroll(input,federal);diagnostics.push(...payroll.diagnostics);worksheets.federalPayroll={lines:payroll.lines,flags:{known:payroll.known}};}return payroll.amountCents;};
 const earned=modern?.earnedIncomeCents,earnedKnown=Number.isSafeInteger(earned)&&earned>=0&&childSource.review.earnedIncome&&modern?.form?.lines?.['18a']===earned,earnedLimit=earnedKnown?P(Math.max(0,earned-300000),1500):null;
 if(named.some(value=>value>0)){
  need(get('5a')===federal.summary?.residentialCleanEnergyCreditCents,'NY_EMPIRE_CLEAN_CREDIT_LINK','Reconcile actual allowed clean-energy credit with federal Schedule3 line5a.');need(earnedKnown,'NY_EMPIRE_EARNED_SOURCE','Resolve the actual federal Schedule8812 earned-income worksheet before New York Worksheet A line11.');
  // The actual federal B worksheet applies only with a qualifying SSN child
  // (Schedule8812 line4 > 0), even though NY also counts timely ITIN children.
  const federalCount=modern?.dependents?.ctcCount,applicable=Number.isInteger(federalCount)&&federalCount>0,actualB15=modern?.creditLimitWorksheetA?.['4'];
  need(Number.isInteger(federalCount)&&federalCount>=0&&Number.isSafeInteger(actualB15)&&actualB15===(applicable?sumMoney(named):0),'NY_EMPIRE_FEDERAL_B_APPLICABILITY','Reconcile actual federal Credit Limit B applicability and its allowed-credit transfer. ODC-only children do not create a federal B worksheet.');
  if(diagnostics.length)return finish(null,null);
  const sub=worksheets.aLine11={lines:{'1':al['8'],'2':earned,'3':earned>300000?earned-300000:null,'4':earnedLimit},flags:{'3':earned>300000,'5':al['1']>=300000,federalBApplicable:applicable}},sl=sub.lines;
  if(!(al['1']<300000&&earnedLimit===0)){
   sl['6']=al['1']<300000||earnedLimit>=sl['1']||!applicable?0:federal.childCreditReserve?.worksheetB?.['11']??null;
   if(!Number.isSafeInteger(sl['6'])||sl['6']<0){need(false,'NY_EMPIRE_FEDERAL_B_PAYROLL','Resolve actual federal Credit Limit Worksheet B line11 before transferring it into New York Worksheet A.');sl['6']=null;}
   sl['7']=sl['6']===null?null:Math.max(earnedLimit,sl['6']);sl['8']=sl['7']===null?null:Math.max(0,sl['1']-sl['7']);
   // The annual NY instruction imports the ACTUAL federal Credit Limit B15;
   // do not recompute clean energy using the informational NY line8 reserve.
   sl['9']=actualB15;sl['10']=al['10'];sl['11']=sumMoney([sl['9'],sl['10']]);al['11']=sl['11'];if(sl['6']===null)return finish(null,null);
  }
 }
 al['12']=Math.max(0,al['9']-al['11']);a.flags['13']=al['8']>al['12'];al['13']=Math.min(al['8'],al['12']);
 if(al['13']===al['8'])return finish(al['13'],0);
 need(earnedKnown,'NY_EMPIRE_EARNED_SOURCE','Resolve the actual federal earned-income worksheet before New York additional child credit.');if(!earnedKnown)return finish(al['13'],null);
 const b=worksheets.b={lines:{'1':al['8'],'2':al['13'],'3':al['8']-al['13'],'4a':earned,'4b':R(childSource.nontaxableCombatPayCents),'5':earned>300000?earned-300000:null,'6':earnedLimit},flags:{'5':earned>300000,'7':count>=3}},bl=b.lines;
 let extra;if(count<3||earnedLimit>=bl['3'])extra=Math.min(bl['3'],earnedLimit);else{bl['7']=getPayroll();bl['8']=bl['7']===null?null:Math.max(earnedLimit,bl['7']);bl['9']=bl['8']===null?null:Math.min(bl['3'],bl['8']);extra=bl['9'];}
 return finish(al['13'],extra);
}
