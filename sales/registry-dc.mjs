import {HttpError} from './model.mjs';
import {publicText} from './public-data.mjs';
import {isTaxBusiness,matchBusiness,normalizedBusiness} from './registry-matching.mjs';

export const DC_SERVICE='https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer';
export const DC_BUSINESS_FIELDS='FILE_NUMBER,BUSINESS_NAME,ENTITY_STATUS,MODELTYPE,LOCALE,BUSNIESS_ADDRESS_LINE1,BUSNIESS_ADDRESS_LINE2,BUSNIESS_ADDRESS_LINE3,BUSNIESS_ADDRESS_LINE4,BUSINESS_CITY,BUSINESS_STATE,ZIPCODE,RA_NAME,DCS_LAST_MOD_DTTM';
export const DC_OWNER_FIELDS='INITIALFILENUMBER,NAME,BUSINESSNAME,MODELTYPE,LOCALE,STATUS,DCS_LAST_MOD_DTTM';
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const caches=new WeakMap();
const date=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<8640000000000000?new Date(value).toISOString().slice(0,10):'';
function sourceURL(layer,where,limit) {
  const url=new URL(`${DC_SERVICE}/${layer}/query`);
  for(const [key,value] of Object.entries({f:'json',where,outFields:layer===0?DC_BUSINESS_FIELDS:DC_OWNER_FIELDS,returnGeometry:'false',orderByFields:layer===0?'FILE_NUMBER,OBJECTID':'INITIALFILENUMBER,OBJECTID',resultRecordCount:String(limit)}))url.searchParams.set(key,value);
  return url.href;
}
async function query(layer,where,fetcher,limit=501) {
  if(!caches.has(fetcher))caches.set(fetcher,new Map());const cache=caches.get(fetcher);
  const url=sourceURL(layer,where,limit),old=cache.get(url);if(old?.expires>Date.now())return structuredClone(old.value);
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'}});
  const payload=JSON.parse(await publicText(response)),key=layer===0?'FILE_NUMBER':'INITIALFILENUMBER',name=layer===0?'BUSINESS_NAME':'NAME';
  if(payload.error||!Array.isArray(payload.features)||payload.features.length>limit||payload.features.some(item=>!item?.attributes||typeof item.attributes[key]!=='string'||!(typeof item.attributes[name]==='string'||layer===2&&item.attributes[name]===null)))throw new HttpError(502,'D.C. public business data is unavailable or its schema changed. Review the official source.');
  const value={rows:payload.features.map(item=>item.attributes),truncated:payload.exceededTransferLimit===true||payload.features.length===limit};
  if(cache.size>=150)cache.delete(cache.keys().next().value);
  cache.set(url,{value,expires:Date.now()+3600000});return structuredClone(value);
}
export function dcRecord(row) {
  const id=String(row?.FILE_NUMBER||'').trim(),name=String(row?.BUSINESS_NAME||'').trim();if(!/^[A-Za-z0-9-]{1,30}$/.test(id)||!name)return null;
  const source=sourceURL(0,`FILE_NUMBER=${literal(id)}`,25),updated=date(row.DCS_LAST_MOD_DTTM);
  return {registryId:id,registryState:'DC',sourceKind:'state_registry',sourceName:'D.C. DLCP corporate registrations',sourceURL:source,
    name,legalName:name,businessId:id,businessType:row.MODELTYPE||'',address:[row.BUSNIESS_ADDRESS_LINE1,row.BUSNIESS_ADDRESS_LINE2,row.BUSNIESS_ADDRESS_LINE3,row.BUSNIESS_ADDRESS_LINE4].filter(Boolean).join(', '),
    city:row.BUSINESS_CITY||'',state:row.BUSINESS_STATE||'DC',zip:row.ZIPCODE||'',status:row.ENTITY_STATUS||'Not supplied',sourceUpdatedAt:updated,
    addressKind:'Published corporate business address; not a verified operating storefront',principals:[],email:'',
    registeredAgents:row.RA_NAME?[{name:row.RA_NAME,role:'Registered agent — not an owner finding',sourceURL:source,verifiedOwner:false}]:[],
    sourceNote:'D.C. corporate registrations do not include every sole proprietor or unregistered business. Beneficial-owner names are read separately by the selected filing number; current ownership and the office match still require review.',
    attribution:'District of Columbia Department of Licensing and Consumer Protection / DC GIS · CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/'};
}
export async function dcTaxBusinesses(locality,fetcher=fetch) {
  const value=String(locality).trim().toUpperCase(),place=/^\d{3,5}$/.test(value)?`ZIPCODE LIKE ${literal(value+'%')}`:`UPPER(BUSINESS_CITY)=${literal(value)}`;
  const tax=['TAX','ACCOUNT','BOOKKEEP','CPA'].map(word=>`UPPER(BUSINESS_NAME) LIKE ${literal('%'+word+'%')}`).join(' OR ');
  const page=await query(0,`UPPER(BUSINESS_STATE)='DC' AND ${place} AND UPPER(ENTITY_STATUS) LIKE 'ACTIVE%' AND (${tax})`,fetcher);
  const records=page.rows.map(dcRecord).filter(Boolean).filter(record=>isTaxBusiness(record)||/\bCPAS?\b/i.test(record.name));
  return {supported:true,results:records.slice(0,500),truncated:page.truncated||records.length>500,source:DC_SERVICE+'/0'};
}
export async function lookupDcBusiness(candidate,fetcher=fetch) {
  let conditions;
  if(candidate.registryId) {
    if(!/^[A-Za-z0-9-]{1,30}$/.test(String(candidate.registryId)))throw new HttpError(400,'Invalid D.C. filing identifier.');
    conditions=[`FILE_NUMBER=${literal(candidate.registryId)}`];
  }else {
    const words=String(candidate.name||'').toUpperCase().match(/[A-Z0-9]+/g)?.filter(word=>word.length>1&&!['LLC','INC','CORP','AND','THE'].includes(word)).slice(0,4)||[];
    const names=words.length?words.map(word=>`UPPER(BUSINESS_NAME) LIKE ${literal('%'+word+'%')}`).join(' AND '):'1=0';
    const road=String(candidate.address||'').toUpperCase().match(/^\s*(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    const address=road?`UPPER(BUSINESS_CITY)=${literal(String(candidate.city||'').toUpperCase())} AND UPPER(BUSNIESS_ADDRESS_LINE1) LIKE ${literal(road[1]+' %'+road[2]+'%')}`:'1=0';
    conditions=[names,address];
  }
  const pages=await Promise.all(conditions.map(condition=>query(0,`(${condition})`,fetcher,25)));
  const records=new Map(pages.flatMap(page=>page.rows).map(dcRecord).filter(Boolean).map(record=>[record.registryId,record]));
  const matches=[...records.values()].map(record=>matchBusiness(candidate,record)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,6);
  await Promise.all(matches.map(async record=>{
    const where=`INITIALFILENUMBER=${literal(record.registryId)}`,url=sourceURL(2,where,101);
    try {
      const page=await query(2,where,fetcher,101),seen=new Set();
      for(const row of page.rows.slice(0,100)) {
        if(row.INITIALFILENUMBER!==record.registryId||normalizedBusiness(row.BUSINESSNAME)!==normalizedBusiness(record.legalName)){
          record.principalIssue='A published owner row conflicts with this filing or business name. Review the official record.';continue;
        }
        const name=String(row.NAME||'').trim();if(!name||seen.has(name))continue;seen.add(name);
        record.principals.push({name,role:'Listed in D.C. beneficial-owner table — current ownership and office match unconfirmed',sourceURL:url,sourceUpdatedAt:date(row.DCS_LAST_MOD_DTTM),verifiedOwner:false});
      }
      record.principalsTruncated=page.truncated||page.rows.length>100;
    }catch {record.principalIssue='D.C. beneficial-owner records could not be loaded. The corporate record is available; review the official owner source or retry.';}
  }));
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated:pages.some(page=>page.truncated),
    message:'Compare the legal name, business address and current filing status. Beneficial-owner names come from the separate official table joined by filing number; registered agents are separate and current ownership is unconfirmed.'};
}
