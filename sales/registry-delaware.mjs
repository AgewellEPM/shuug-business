import {HttpError} from './model.mjs';
import {publicText} from './public-data.mjs';
import {isTaxBusiness,matchBusiness} from './registry-matching.mjs';

export const DELAWARE_DATA='https://data.delaware.gov/resource/5zy2-grhr.json';
export const DELAWARE_FIELDS='license_number,business_name,trade_name,category,address_1,address_2,city,state,zip,country,current_license_valid_from,current_license_valid_to';
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const caches=new WeakMap();
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)?value.slice(0,10):'';
const addressKey=value=>String(value||'').toUpperCase().replace(/\b(?:STREET|ROAD|AVENUE|BOULEVARD|DRIVE|LANE|COURT|PLACE|SUITE)\b/g,word=>({STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',PLACE:'PL',SUITE:'STE'})[word]).replace(/[^A-Z0-9]/g,'');
function sourceURL(where,limit) {
  const url=new URL(DELAWARE_DATA);
  for(const [key,value] of Object.entries({$select:DELAWARE_FIELDS,$where:where,$order:'license_number,business_name,trade_name,address_1,address_2,city,zip,category',$limit:String(limit)}))url.searchParams.set(key,value);
  return url.href;
}
async function query(where,fetcher,limit=501) {
  if(!caches.has(fetcher))caches.set(fetcher,new Map());const cache=caches.get(fetcher);
  const url=sourceURL(where,limit),old=cache.get(url);if(old?.expires>Date.now())return structuredClone(old.rows);
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'}});
  const rows=JSON.parse(await publicText(response));
  if(!Array.isArray(rows)||rows.length>limit||rows.some(row=>!row||!/^\d{1,12}$/.test(String(row.license_number||''))||typeof row.business_name!=='string'))throw new HttpError(502,'The Delaware business-license source schema changed. Review the official source.');
  if(cache.size>=150)cache.delete(cache.keys().next().value);
  cache.set(url,{rows,expires:Date.now()+3600000});return structuredClone(rows);
}
export function delawareRecord(row) {
  const id=String(row?.license_number||''),legalName=String(row?.business_name||'').trim(),tradeName=String(row?.trade_name||'').trim();
  if(!/^\d{1,12}$/.test(id)||!legalName)return null;
  const from=date(row.current_license_valid_from),to=date(row.current_license_valid_to);
  // A license can cover multiple activities/locations. Keep the full selected
  // business address in its source query; a license number alone is not an office.
  const where=['license_number='+id,...['business_name','trade_name','category','address_1','address_2','city','state','zip'].map(key=>row[key]!==undefined&&row[key]!==null?`${key}=${literal(row[key])}`:`${key} is null`)].join(' and ');
  return {registryId:`license:${id}`,registryState:'DE',sourceKind:'state_registry',sourceName:'Delaware Division of Revenue business licenses',sourceURL:sourceURL(where,25),
    name:tradeName||legalName,legalName,tradeName,businessId:id,businessType:row.category||'Published business license',
    address:[row.address_1,row.address_2].filter(Boolean).join(', '),city:row.city||'',state:row.state||'DE',zip:row.zip||'',
    addressKind:'Published license business address; not a verified operating storefront',status:`Published license${from?'; valid from '+from:''}${to?'; valid to '+to:''}`,
    licenseValidFrom:from,licenseValidTo:to,principals:[],registeredAgents:[],email:'',
    sourceNote:'Division of Revenue business licenses are separate from Division of Corporations entity filings. A legal business or trade name is not an owner finding. This feed has no owner, phone or email fields.',
    attribution:'Delaware Department of Finance, Division of Revenue · public-domain business-license data',licenseURL:'https://data.delaware.gov/Licenses-and-Certifications/Delaware-Business-Licenses/5zy2-grhr/about_data'};
}
const taxRecord=record=>isTaxBusiness({name:`${record.name} ${record.legalName}`})||/\bCPAS?\b/i.test(`${record.name} ${record.legalName}`);
const uniqueRecords=rows=>[...new Map(rows.map(delawareRecord).filter(Boolean).map(record=>[record.sourceURL,record])).values()];
function match(candidate,record) {
  // A published DBA can differ from its legal licensee. Try both without
  // guessing an alias, and preserve the displayed trade name/chain identity.
  const matches=[record.name,record.legalName].map(name=>matchBusiness({...candidate,registryId:undefined},{...record,name})).filter(Boolean).sort((a,b)=>b.score-a.score);
  const selected=matches[0];if(!selected)return null;
  const selectedId=candidate.registryId===record.registryId&&(!candidate.registryState||candidate.registryState==='DE');
  if(selectedId&&(!candidate.address||addressKey(candidate.address)!==addressKey(record.address)||String(candidate.city||'').trim().toUpperCase()!==String(record.city).trim().toUpperCase()||candidate.state!==record.state))return null;
  return {...record,match:selectedId?'registry_record':selected.match,score:selectedId?6:selected.score};
}
export async function delawareTaxBusinesses(locality,fetcher=fetch) {
  const value=String(locality).trim().toUpperCase(),place=/^\d{3,5}$/.test(value)?`zip like ${literal(value+'%')}`:`upper(city)=${literal(value)}`;
  const tax=['business_name','trade_name'].flatMap(field=>['TAX','ACCOUNT','BOOKKEEP','CPA'].map(word=>`upper(${field}) like ${literal('%'+word+'%')}`)).join(' or ');
  const today=new Date().toISOString().slice(0,10),where=`upper(state)='DE' and ${place} and (${tax}) and current_license_valid_from <= '${today}T23:59:59' and current_license_valid_to >= '${today}T00:00:00'`;
  const rows=await query(where,fetcher);
  const records=uniqueRecords(rows).filter(taxRecord);
  return {supported:true,results:records.slice(0,500),truncated:rows.length===501||records.length>500,source:'https://data.delaware.gov/d/5zy2-grhr'};
}
export async function lookupDelawareBusiness(candidate,fetcher=fetch) {
  let conditions;
  if(candidate.registryId) {
    const id=String(candidate.registryId).match(/^license:(\d{1,12})$/)?.[1];if(!id)throw new HttpError(400,'Invalid Delaware license identifier.');
    conditions=[`license_number=${id}`];
  }else {
    const words=String(candidate.name||'').toUpperCase().match(/[A-Z0-9]+/g)?.filter(word=>word.length>1&&!['LLC','INC','CORP','AND','THE'].includes(word)).slice(0,4)||[];
    const names=words.length?['business_name','trade_name'].map(field=>'('+words.map(word=>`upper(${field}) like ${literal('%'+word+'%')}`).join(' and ')+')').join(' or '):'false';
    const road=String(candidate.address||'').toUpperCase().match(/^\s*(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    const address=road?`upper(city)=${literal(String(candidate.city||'').toUpperCase())} and upper(address_1) like ${literal(road[1]+' %'+road[2]+'%')}`:'false';
    conditions=[names,address];
  }
  const pages=await Promise.all(conditions.map(condition=>query(`upper(state)='DE' and (${condition})`,fetcher,25)));
  const matches=uniqueRecords(pages.flat()).map(record=>match(candidate,record)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,6);
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated:pages.some(rows=>rows.length===25),
    message:'Compare the published legal/trade name, complete business address and license dates. A Delaware revenue license is separate from a corporate filing and supplies no owner names.'};
}
