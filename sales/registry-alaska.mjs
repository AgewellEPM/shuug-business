import {HttpError} from './model.mjs';
import {publicText} from './public-data.mjs';
import {isTaxBusiness,matchBusiness} from './registry-matching.mjs';

export const ALASKA_LAYER='https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2';
const fields='OBJECTID,LicenseNumber,BusinessName,Owners,Status,ExpireDate,created_date,PhysicalLine1,PhysicalLine2,PhysicalCity,PhysicalState,PhysicalZipOut';
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const caches=new WeakMap();
const date=value=>typeof value==='number' && Number.isFinite(value) && Math.abs(value)<8640000000000000?new Date(value).toISOString().slice(0,10):'';
async function query(parameters,fetcher,limit=500) {
  if(!caches.has(fetcher))caches.set(fetcher,new Map());const cache=caches.get(fetcher);
  const body=new URLSearchParams({f:'json',...parameters,outFields:fields,orderByFields:'LicenseNumber',resultRecordCount:String(limit),returnGeometry:'false'});
  const key=body.toString(),old=cache.get(key);if(old?.expires>Date.now())return structuredClone(old.value);
  const response=await fetcher(ALASKA_LAYER+'/query',{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'}});
  const payload=JSON.parse(await publicText(response));
  if(payload.error || !Array.isArray(payload.features) || payload.features.some(item=>!item?.attributes))throw new HttpError(502,'Alaska public license data is unavailable. Review the official source or retry.');
  const value={records:payload.features.slice(0,limit).map(item=>alaskaRecord(item.attributes)).filter(Boolean),truncated:payload.exceededTransferLimit===true || payload.features.length>limit};
  if(cache.size>=150)cache.delete(cache.keys().next().value);
  cache.set(key,{value,expires:Date.now()+3600000});return structuredClone(value);
}
export function alaskaRecord(row) {
  const id=String(row?.LicenseNumber || ''),name=String(row?.BusinessName || '');
  if(!/^\d{1,10}$/.test(id)||!name)return null;
  // The layer's geometry is an arbitrary community centroid. It is deliberately
  // not imported: the existing Census address check supplies any displayed pin.
  const url=new URL(ALASKA_LAYER+'/query');
  const objectId=String(row.OBJECTID || '');
  if(/^\d+$/.test(objectId))for(const [key,value] of Object.entries({f:'pjson',objectIds:objectId,outFields:fields,returnGeometry:'false'}))url.searchParams.set(key,value);
  const sourceURL=/^\d+$/.test(objectId)?url.href:ALASKA_LAYER;
  const snapshot=date(row.created_date),expiry=date(row.ExpireDate),owner=String(row.Owners || '').trim();
  return {registryId:`license:${id}`,registryState:'AK',sourceKind:'state_registry',sourceName:'Alaska DCCED business-license extract (partial)',sourceURL,
    name,legalName:name,businessId:id,businessType:'Alaska business license · not a corporate-entity record',
    address:[row.PhysicalLine1,row.PhysicalLine2].filter(Boolean).join(', '),city:row.PhysicalCity || '',state:row.PhysicalState || 'AK',zip:row.PhysicalZipOut || '',
    status:`${row.Status || 'Not supplied'} in published extract${expiry?'; expires '+expiry:''}${snapshot?'; extract '+snapshot:''}`,sourceUpdatedAt:snapshot,
    addressKind:'Reported physical business address. One location per license; operating status needs review.',email:'',registeredAgents:[],
    principals:owner?[{name:owner,role:'Listed license owner(s), person or entity — business match unconfirmed',sourceURL,verifiedOwner:false}]:[],
    sourceNote:'Partial DCCED extract: roughly 12% of active licenses are excluded because the reported state/city could not be matched. Check the primary licensing record before relying on ownership or status.'};
}
export async function alaskaTaxBusinesses(locality,fetcher=fetch) {
  const value=String(locality).trim().toUpperCase();
  // The documented literal text search works on this service. Complex SQL
  // filters return an HTTP error; apply locality/status to these bounded reads.
  const pages=await Promise.all(['TAX','ACCOUNT','BOOKKEEP'].map(text=>query({text},fetcher)));
  const unique=new Map(pages.flatMap(page=>page.records).map(row=>[row.registryId,row]));
  const records=[...unique.values()].filter(row=>isTaxBusiness(row) && row.state==='AK' && /^Active in published extract/.test(row.status) &&
    (/^\d{3,5}$/.test(value)?String(row.zip).startsWith(value):String(row.city).trim().toUpperCase()===value));
  return {supported:true,results:records.slice(0,500),truncated:pages.some(page=>page.truncated)||records.length>500,source:ALASKA_LAYER};
}
export async function lookupAlaskaBusiness(candidate,fetcher=fetch) {
  let conditions;
  if(candidate.registryId) {
    const id=String(candidate.registryId).match(/^license:(\d{1,10})$/)?.[1];
    if(!id)throw new HttpError(400,'Invalid Alaska license identifier.');
    conditions=[{where:`LicenseNumber=${literal(id)}`}];
  }else {
    const full=String(candidate.name || '').trim().toUpperCase();
    const anchor=full.match(/[A-Z0-9]+/g)?.find(word=>word.length>2&&!['LLC','INC','CORP','AND','THE','TAX','ACCOUNTING','SERVICES'].includes(word));
    conditions=[...new Set([full,anchor].filter(Boolean))].map(text=>({text}));
  }
  const pages=await Promise.all(conditions.map(condition=>query(condition,fetcher,condition.where?25:500)));
  const records=new Map(pages.flatMap(page=>page.records).map(row=>[row.registryId,row]));
  const matches=[...records.values()].map(row=>matchBusiness(candidate,row)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,6);
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated:pages.some(page=>page.truncated),
    message:'Partial Alaska DCCED business-license extract, not a complete corporations registry. Owner fields may name people or entities. Confirm the license, office match and current status in the primary source.'};
}
