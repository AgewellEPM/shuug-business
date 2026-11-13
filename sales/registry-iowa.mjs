import {IOWA_CATALOG,queryIowa} from './iowa-data.mjs';
import {isTaxBusiness,matchBusiness} from './registry-matching.mjs';

// GoogleSQL string literals, with caller text kept out of query structure.
const literal=value=>`'${String(value).replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n').replaceAll('\r','\\r')}'`;
export function iowaRecord(row) {
  const id=String(row.corp_number || ''),name=String(row.legal_name || '');if(!id||!name)return null;
  return {registryId:id,registryState:'IA',sourceKind:'state_registry',sourceName:'Iowa Secretary of State via Iowa Data Hub',sourceURL:IOWA_CATALOG,
    attribution:'Iowa Secretary of State via Iowa Data Hub · CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',
    name,legalName:name,businessId:id,address:[row.ho_address_1,row.ho_address_2].filter(Boolean).join(', '),city:row.ho_city || '',state:row.ho_state || 'IA',zip:row.ho_zip || '',
    status:'Active in monthly Iowa dataset',businessType:row.corporation_type || '',addressKind:'Reported principal office; current storefront status needs review',email:'',principals:[],
    registeredAgents:row.registered_agent?[{name:row.registered_agent,role:'Registered agent — not an owner finding',sourceURL:IOWA_CATALOG,verifiedOwner:false}]:[]};
}
export async function iowaTaxBusinesses(locality,fetcher=fetch) {
  const query=String(locality).trim().toUpperCase();
  const place=/^\d{3,5}$/.test(query)?`STARTS_WITH(ho_zip,${literal(query)})`:`UPPER(ho_city)=${literal(query)}`;
  const tax=['TAX','ACCOUNT','BOOKKEEP'].map(word=>`STRPOS(UPPER(legal_name),${literal(word)})>0`).join(' OR ');
  const found=await queryIowa(`UPPER(ho_state)='IA' AND (${place}) AND (${tax})`,501,fetcher);
  return {supported:true,results:found.rows.map(iowaRecord).filter(Boolean).filter(isTaxBusiness).slice(0,500),truncated:found.total>500,source:IOWA_CATALOG};
}
export async function lookupIowaBusiness(candidate,fetcher=fetch) {
  let conditions;
  if(candidate.registryId)conditions=[`corp_number=${literal(candidate.registryId)}`];
  else {
    const words=String(candidate.name).toUpperCase().match(/[A-Z0-9]+/g)?.filter(word=>word.length>1&&!['LLC','INC','CORP','AND','THE'].includes(word)).slice(0,4)||[];
    const names=words.length?words.map(word=>`STRPOS(UPPER(legal_name),${literal(word)})>0`).join(' AND '):'FALSE';
    const road=String(candidate.address || '').toUpperCase().match(/^\s*(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    const address=road?`UPPER(ho_city)=${literal(String(candidate.city).toUpperCase())} AND UPPER(ho_state)=${literal(candidate.state)} AND STARTS_WITH(UPPER(ho_address_1),${literal(road[1]+' ')}) AND STRPOS(UPPER(ho_address_1),${literal(road[2])})>0`:'FALSE';
    conditions=[names,address];
  }
  const pages=await Promise.all(conditions.map(where=>queryIowa(where,25,fetcher)));
  const rows=new Map(pages.flatMap(page=>page.rows).map(row=>[row.corp_number,row]));
  const matches=[...rows.values()].map(iowaRecord).filter(Boolean).map(row=>matchBusiness(candidate,row)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,6);
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated:pages.some(page=>page.total>=25),
    message:'Monthly active Iowa business entities. Sole proprietors and some partnerships are not included. Registered agents are separate; this feed does not publish owners, officers, business email or phone.'};
}
