import { HttpError } from './model.mjs';
import { publicText } from './public-data.mjs';
import { isTaxBusiness, matchBusiness } from './registry-matching.mjs';

// Fixed official data sources. Field lists deliberately omit officer/agent home
// addresses, demographics and tax identifiers that are unnecessary for outreach.
export const DATASETS = Object.freeze({
  CO:{host:'data.colorado.gov',id:'4ykn-tg5h',key:'entityid',name:'entityname',city:'principalcity',region:'principalstate',zip:'principalzipcode',street:'principaladdress1',
    fields:'entityid,entityname,principaladdress1,principaladdress2,principalcity,principalstate,principalzipcode,entitystatus,entitytype,entityformdate,agentfirstname,agentmiddlename,agentlastname,agentsuffix,agentorganizationname'},
  NY:{host:'data.ny.gov',id:'n9v6-gdp6',key:'dos_id',name:'current_entity_name',city:'location_city',region:'location_state',zip:'location_zip',street:'location_address_1',
    fields:'dos_id,current_entity_name,entity_type,initial_dos_filing_date,location_address_1,location_address_2,location_city,location_state,location_zip,dos_process_address_1,dos_process_address_2,dos_process_city,dos_process_state,dos_process_zip,chairman_name,registered_agent_name'},
  OR:{host:'data.oregon.gov',id:'tckn-sxa6',key:'registry_number',name:'business_name',city:'city',region:'state',zip:'zip',street:'address',base:"associated_name_type='PRINCIPAL PLACE OF BUSINESS'",
    fields:'registry_number,business_name,entity_type,registry_date,associated_name_type,address,address_continued,city,state,zip'},
  PA:{host:'data.pa.gov',id:'3urc-uaba',key:'filing_number',name:'business_name',city:'city',region:'state',zip:'zip',street:'address_line1',
    fields:'filing_number,business_name,address_line1,address_line2,city,state,zip,typeofbusinessregistration'},
  TX:{host:'data.texas.gov',id:'9cir-efmm',key:'secretary_of_state_sos_or_coa_file_number',name:'taxpayer_name',city:'taxpayer_city',region:'taxpayer_state',zip:'taxpayer_zip',street:'taxpayer_address',
    fields:'secretary_of_state_sos_or_coa_file_number,taxpayer_name,taxpayer_address,taxpayer_city,taxpayer_state,taxpayer_zip,taxpayer_organizational_type,sos_status_code,sos_charter_date,right_to_transact_business_code'},
});
const literal = value => `'${String(value).replaceAll("'","''")}'`;
const join = (...parts) => parts.filter(Boolean).join(', ');
const cache = new Map();
function dataURL(spec, where, fields=spec.fields, limit=501) {
  const url=new URL(`https://${spec.host}/resource/${spec.id}.json`);
  url.searchParams.set('$select',fields); url.searchParams.set('$where',where);
  url.searchParams.set('$order',spec.key); url.searchParams.set('$limit',String(limit)); return url;
}
async function query(spec,where,fetcher,fields=spec.fields,limit=501) {
  const url=dataURL(spec,where,fields,limit), old=cache.get(url.href);
  if(old?.expires>Date.now())return structuredClone(old.rows);
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/json','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'}});
  const rows=JSON.parse(await publicText(response));
  if(!Array.isArray(rows))throw new HttpError(502,'The official business source returned an unsupported response.');
  if(cache.size>=150)cache.delete(cache.keys().next().value);
  cache.set(url.href,{rows,expires:Date.now()+3600000});return rows;
}
const keyCondition = (spec,id) => `${spec.key}=${spec.key==='entityid' ? String(Number(id)) : literal(id)}`;
function sourceFor(region,id) {
  const spec=DATASETS[region],where=[keyCondition(spec,id),spec.base].filter(Boolean).join(' and ');
  return dataURL(spec,where,spec.fields,101).href;
}
function person(name,role,sourceURL) { return name ? [{name:String(name),role,sourceURL,verifiedOwner:false}] : []; }
export function socrataRecord(region,row) {
  const spec=DATASETS[region], id=String(row[spec.key] || ''); if(!id)return null;
  const sourceURL=sourceFor(region,id);
  const record={registryId:id,registryState:region,sourceKind:'state_registry',sourceName:`${region} official business data`,sourceURL,
    name:String(row[spec.name] || ''),legalName:String(row[spec.name] || ''),businessId:id,addressKind:'Registered business address',
    address:row[spec.street] || '',city:row[spec.city] || '',state:row[spec.region] || region,zip:row[spec.zip] || '',
    status:'Published registration',businessType:'',principals:[],registeredAgents:[],email:''};
  if(region==='CO') Object.assign(record,{address:join(row.principaladdress1,row.principaladdress2),status:row.entitystatus || 'Not supplied',businessType:row.entitytype || '',
    registeredAgents:person(row.agentorganizationname || [row.agentfirstname,row.agentmiddlename,row.agentlastname,row.agentsuffix].filter(Boolean).join(' '),'Registered agent — not an owner finding',sourceURL)});
  if(region==='NY') {
    const location=Boolean(row.location_address_1);
    Object.assign(record,{address:location?join(row.location_address_1,row.location_address_2):join(row.dos_process_address_1,row.dos_process_address_2),
      city:(location?row.location_city:row.dos_process_city)||'',state:(location?row.location_state:row.dos_process_state)||region,zip:(location?row.location_zip:row.dos_process_zip)||'',
      addressKind:location?'Principal business location':'Service-of-process address; not a storefront finding',status:'Active in published dataset',businessType:row.entity_type || '',
      principals:person(row.chairman_name,'Chairman / CEO (registry field)',sourceURL),registeredAgents:person(row.registered_agent_name,'Registered agent — not an owner finding',sourceURL)});
  }
  if(region==='OR')Object.assign(record,{address:join(row.address,row.address_continued),status:'Active in published dataset',businessType:row.entity_type || '',addressKind:'Principal place of business'});
  if(region==='PA')Object.assign(record,{address:join(row.address_line1,row.address_line2),businessType:row.typeofbusinessregistration || ''});
  if(region==='TX')Object.assign(record,{status:`Active franchise taxpayer${row.sos_status_code?'; registry status code '+row.sos_status_code:''}`,businessType:row.taxpayer_organizational_type || '',addressKind:'Taxpayer business mailing address'});
  return record;
}
function placeCondition(spec,region,locality) {
  const field=/^\d{3,5}$/.test(locality)?spec.zip:spec.city;
  const where=field===spec.zip?`${field} like ${literal(locality+'%')}`:`upper(${field})=${literal(locality.toUpperCase())}`;
  const main=`upper(${spec.region})=${literal(region)} and ${where}`;
  if(region!=='NY')return main;
  const fallback=/^\d{3,5}$/.test(locality)?`dos_process_zip like ${literal(locality+'%')}`:`upper(dos_process_city)=${literal(locality.toUpperCase())}`;
  return `(${main}) or (location_address_1 is null and upper(dos_process_state)='NY' and ${fallback})`;
}
export async function socrataTaxBusinesses(region,locality,fetcher=fetch) {
  const spec=DATASETS[region]; if(!spec)return {supported:false,results:[],truncated:false};
  const tax=['TAX','ACCOUNT','BOOKKEEP'].map(word=>`upper(${spec.name}) like '%${word}%'`).join(' or ');
  const where=[`(${placeCondition(spec,region,String(locality).trim())})`,`(${tax})`,spec.base].filter(Boolean).join(' and ');
  const rows=await query(spec,where,fetcher), records=rows.map(row=>socrataRecord(region,row)).filter(Boolean).filter(isTaxBusiness);
  return {supported:true,results:records.slice(0,500),truncated:rows.length>500,source:`https://${spec.host}/d/${spec.id}`};
}
export async function lookupSocrataBusiness(candidate,fetcher=fetch) {
  const region=candidate.registryState || candidate.state,spec=DATASETS[region]; if(!spec)return {supported:false,matches:[]};
  let conditions;
  if(candidate.registryId)conditions=[keyCondition(spec,candidate.registryId)];
  else {
    const words=String(candidate.name).toUpperCase().match(/[A-Z0-9]+/g)?.filter(word=>word.length>1&&!['LLC','INC','CORP','AND','THE'].includes(word)).slice(0,4) || [];
    const names=words.length?words.map(word=>`upper(${spec.name}) like ${literal('%'+word+'%')}`).join(' and '):'false';
    const road=String(candidate.address || '').toUpperCase().match(/^\s*(\d+[A-Z]?)\s+([A-Z0-9]+)/);
    const address=road?`upper(${spec.city})=${literal(String(candidate.city).toUpperCase())} and upper(${spec.street}) like ${literal(road[1]+' %'+road[2]+'%')}`:'false';
    conditions=[names,address];
  }
  const pages=await Promise.all(conditions.map(condition=>query(spec,[`(${condition})`,spec.base].filter(Boolean).join(' and '),fetcher,spec.fields,25)));
  const unique=new Map(pages.flat().map(row=>[String(row[spec.key]),row]));
  const matches=[...unique.values()].map(row=>socrataRecord(region,row)).filter(Boolean).map(record=>matchBusiness(candidate,record)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,6);
  if(region==='OR')await Promise.all(matches.map(async record=>{
    const fields='registry_number,associated_name_type,first_name,middle_name,last_name,suffix,not_of_record_entity,entity_of_record_name';
    const where=`registry_number=${literal(record.registryId)} and associated_name_type in ('AUTHORIZED REPRESENTATIVE','REGISTERED AGENT')`;
    const sourceURL=dataURL(spec,where,fields,101).href;
    try {
      const people=await query(spec,where,fetcher,fields,101);
      for(const row of people.slice(0,100)){
        const name=[row.first_name,row.middle_name,row.last_name,row.suffix].filter(Boolean).join(' ') || row.entity_of_record_name || row.not_of_record_entity || '';
        if(row.associated_name_type==='REGISTERED AGENT')record.registeredAgents.push(...person(name,'Registered agent — not an owner finding',sourceURL));
        else record.principals.push(...person(name,'Authorized representative — ownership unconfirmed',sourceURL));
      }
      record.principalsTruncated=people.length>100;
    }catch { record.principalIssue='Representative records could not be loaded. Review the official registry source.'; }
  }));
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated:pages.some(rows=>rows.length===25),
    message:'Compare the legal name and address before linking a record. Registered agents are listed separately; officers and representatives are not automatically owners.'};
}
