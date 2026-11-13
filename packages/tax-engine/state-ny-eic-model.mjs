import {strictObject,list,text} from './model.mjs';
import {checkedMoney} from './money.mjs';

export const nyEicReviews=Object.freeze([
 ['filing','Full-year New York and city residency, unchanged federal/state filing status and original-return treatment reconciled'],
 ['federal','Current computed federal EIC, qualifying children and saved combat-pay election reconciled'],
 ['income','All wage, business and investment source links and ordinary earned-income treatment reconciled'],
 ['worksheetB','Resident and available accumulation-distribution credits reviewed for IT-215 Worksheet B'],
].map(Object.freeze));
export const newNYEicChild=(dependentId='')=>({dependentId,claimantRelationship:'unknown',mainHome:'unknown',source:'',reviewed:false});
export const newNYEicOrder=()=>({id:'',childIds:[],throughNYSCU:'unknown',effectiveFrom:'',effectiveThrough:'',currentSupportDueCents:0,currentSupportPaidCents:0,source:'',reviewed:false});
export const newNYNoncustodialEic=()=>({claimant:'unknown',children:[],orders:[],combatElections:{taxpayer:'unknown',spouse:'unknown'},source:'',review:{children:false,orders:false}});
export const newNYEic=()=>({filingStatus:'unknown',returnType:'unknown',worksheetBCredits:'unknown',primaryBusinessId:'',noncustodial:newNYNoncustodialEic(),source:'',review:Object.fromEntries(nyEicReviews.map(([key])=>[key,false]))});
const choice=(value,allowed,label)=>{if(!allowed.includes(value))throw new Error(`${label} requires a supported source decision.`);};
const bool=(value,label)=>{if(typeof value!=='boolean')throw new Error(`${label} must be explicitly reviewed.`);};
const source=(row,label)=>{text(row.source,`${label} source`,1000);bool(row.reviewed,`${label} review`);};
export function validateNYEic(value){
 strictObject(value,Object.keys(newNYEic()),'New York EIC source');choice(value.filingStatus,['unknown','sameAsFederal','different'],'NY EIC filing status');choice(value.returnType,['unknown','original','amended'],'NY EIC return type');choice(value.worksheetBCredits,['unknown','none','other'],'NY EIC Worksheet B credits');text(value.primaryBusinessId,'NY EIC primary business ID',100);text(value.source,'NY EIC source',1000);strictObject(value.review,nyEicReviews.map(([key])=>key),'NY EIC reviews');for(const item of Object.values(value.review))bool(item,'NY EIC review');
 const nc=value.noncustodial;strictObject(nc,Object.keys(newNYNoncustodialEic()),'NY noncustodial EIC source');choice(nc.claimant,['unknown','taxpayer','spouse'],'NY noncustodial claimant');text(nc.source,'NY noncustodial source',1000);strictObject(nc.review,['children','orders'],'NY noncustodial source reviews');for(const item of Object.values(nc.review))bool(item,'NY noncustodial review');
 const children=new Set();for(const row of list(nc.children,'NY noncustodial children',100)){strictObject(row,Object.keys(newNYEicChild()),'NY noncustodial child');text(row.dependentId,'NY noncustodial linked child ID',100);if(!row.dependentId||children.has(row.dependentId))throw new Error('Each NY noncustodial child must have a distinct retained person ID.');children.add(row.dependentId);choice(row.claimantRelationship,['unknown','biological','adoptive','other'],'NY noncustodial claimant parent relationship');choice(row.mainHome,['unknown','elsewhere','withClaimant'],'NY noncustodial child main home');source(row,'NY noncustodial child');}
 const orders=new Set();for(const row of list(nc.orders,'NY child-support orders',100)){strictObject(row,Object.keys(newNYEicOrder()),'NY child-support order');text(row.id,'NY child-support order ID',100);if(!row.id||orders.has(row.id))throw new Error('Each child-support order must have a distinct source ID.');orders.add(row.id);const ids=list(row.childIds,'Order child links',100);if(!ids.length||new Set(ids).size!==ids.length)throw new Error('A child-support order must identify its distinct linked children.');for(const id of ids)text(id,'Order child ID',100);choice(row.throughNYSCU,['unknown','yes','no'],'NY Support Collection Unit treatment');for(const key of ['effectiveFrom','effectiveThrough'])text(row[key],'Support order '+key,10);for(const key of ['currentSupportDueCents','currentSupportPaidCents'])checkedMoney(row[key],'Support order '+key);source(row,'NY child-support order');}
 strictObject(nc.combatElections,['taxpayer','spouse'],'NY noncustodial combat elections');for(const item of Object.values(nc.combatElections))choice(item,['unknown','include','exclude'],'NY noncustodial combat election');return value;
}
