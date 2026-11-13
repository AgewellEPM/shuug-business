import { HttpError } from './model.mjs';
import { publicText } from './public-data.mjs';
import { matchBusiness } from './registry-matching.mjs';

// Anonymous public routes used by the Secretary of State's own search frontend.
// The public drawer omits business addresses. Never substitute an agent address.
const origin = 'https://enterprise.sos.nm.gov';
const cache = new Map();
const clean = value => typeof value === 'string' ? value.trim().slice(0,300) : '';
const detailURL = id => `${origin}/api/FilingDetail/business/${id}`;
async function read(url, fetcher, normalize) {
  const old = cache.get(url);
  if (old?.expires > Date.now()) return structuredClone(old.value);
  const response = await fetcher(url, { signal:AbortSignal.timeout(15000), redirect:'error',
    headers:{Accept:'application/json','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'} });
  // Cache only the selected business fields, never the raw drawer's addresses.
  const value = normalize(JSON.parse(await publicText(response)));
  if (cache.size >= 150) cache.delete(cache.keys().next().value);
  cache.set(url, {value, expires:Date.now()+3600000}); return structuredClone(value);
}
function record(id, name, fields = {}) {
  return { registryId:String(id), registryState:'NM', sourceKind:'state_registry', sourceName:'New Mexico Secretary of State',
    sourceURL:detailURL(id), name, legalName:name, businessId:'', address:'', city:'', state:'NM', zip:'', email:'',
    addressKind:'Business address is not supplied by this public registry response; compare the selected directory office separately.',
    status:'Not supplied', businessType:'', principals:[], registeredAgents:[], ...fields };
}
function searchRows(data) {
  if (!Array.isArray(data?.template) || !data.rows || typeof data.rows !== 'object' || Array.isArray(data.rows))
    throw new HttpError(502,'The New Mexico registry returned an unsupported search response.');
  const rows = Object.values(data.rows);
  return { truncated:rows.length >= 100, results:rows.slice(0,100).flatMap(row => {
    const id=String(row.ID || ''), name=clean(Array.isArray(row.TITLE) ? row.TITLE[0] : row.TITLE);
    return /^[1-9]\d{0,11}$/.test(id) && name ? [record(id,name,{ businessId:clean(row.RECORD_NUM),
      status:clean(row.BusinessStatusId), businessType:clean(row.BusinessRecordTypeId) })] : [];
  }) };
}
export function newMexicoRecord(id, data) {
  if (!/^[1-9]\d{0,11}$/.test(String(id)) || !Array.isArray(data?.DRAWER_DETAIL_LIST))
    throw new HttpError(502,'The New Mexico registry returned an unsupported record response.');
  const fields = new Map(data.DRAWER_DETAIL_LIST.filter(row=>typeof row.LABEL==='string').map(row=>[row.LABEL,row.VALUE]));
  const name=clean(fields.get('Business Name')), businessId=clean(fields.get('Record #'));
  if (!name || !businessId) throw new HttpError(502,'The New Mexico registry did not identify the requested business record.');
  const result=record(id,name,{businessId,status:clean(fields.get('Status')),businessType:clean(fields.get('Entity Type'))});
  const people=new Map();
  for (const label of ['Directors','Officers']) {
    const lines=String(fields.get(label) || '').split(/\r?\n/).filter(Boolean);
    if(lines.length>100)result.principalsTruncated=true;
    for(const line of lines.slice(0,100)) {
      const match=line.trim().match(/^([^:\r\n<>]{1,200}):\s*([A-Za-z /().-]{1,100})$/);
      if(!match) { result.principalIssue='Some published officer/director rows could not be read. Review the official source.'; continue; }
      const name=match[1].trim(), key=name.toUpperCase();
      if(!people.has(key))people.set(key,{name,roles:new Set()});
      people.get(key).roles.add(match[2].trim());
    }
  }
  result.principals=[...people.values()].map(person=>({name:person.name,role:[...person.roles].join(' / ')+' — ownership unconfirmed',sourceURL:result.sourceURL,verifiedOwner:false}));
  const agent=String(fields.get('Agent') || '').split(/\r?\n/);
  // A separate first line is the name; subsequent lines may be a home address.
  if(agent.length>1 && clean(agent[0]) && !/^(?:N\/A|NONE)$/i.test(agent[0].trim()))
    result.registeredAgents=[{name:clean(agent[0]),role:'Registered agent — not an owner finding',sourceURL:result.sourceURL,verifiedOwner:false}];
  if(!result.principals.length && fields.get('Organizers and Incorporators'))
    result.principalIssue='No officers or directors are published here. Filing organizers and incorporators are not treated as owners.';
  return result;
}
export async function lookupNewMexicoBusiness(candidate, fetcher=fetch) {
  let matches=[], truncated=false;
  if(candidate.registryId) {
    if(!/^[1-9]\d{0,11}$/.test(String(candidate.registryId)))throw new HttpError(400,'Invalid New Mexico registry identifier.');
    const found=await read(detailURL(candidate.registryId),fetcher,data=>newMexicoRecord(candidate.registryId,data));
    const matched=matchBusiness(candidate,found);if(matched)matches=[matched];
  } else {
    const full=clean(candidate.name).slice(0,200);
    const shorter=full.replace(/[, .]+(?:L\.?L\.?C\.?|INCORPORATED|INC\.?|CORPORATION|CORP\.?|LLP|PC)\s*$/i,'').trim();
    const queries=[...new Set([full,shorter])].filter(value=>value.length>=2);
    for(const query of queries) {
      const url=new URL('/api/businessEntitySearch/webSearch',origin);
      url.searchParams.set('SEARCH_VALUE',query);url.searchParams.set('QueryTypeId','2');
      const search=await read(url.href,fetcher,searchRows);truncated ||= search.truncated;
      const matching=search.results.map(row=>matchBusiness(candidate,row)).filter(Boolean);
      truncated ||= matching.length>6;
      const selected=matching.slice(0,6);
      if(!selected.length)continue;
      matches=await Promise.all(selected.map(async summary=>{
        try {
          const detailed=await read(detailURL(summary.registryId),fetcher,data=>newMexicoRecord(summary.registryId,data));
          return matchBusiness(candidate,detailed);
        }catch{return {...summary,principalIssue:'The record detail could not be loaded. Review the official registry source or retry.'};}
      }));
      matches=matches.filter(Boolean);break;
    }
  }
  return {supported:true,matches,checkedAt:new Date().toISOString(),truncated,
    message:'New Mexico legal-name lookup: the public response does not supply the business address. Confirm that the selected office is this legal entity before using listed officers/directors. Organizers and registered agents are not owner findings.'};
}
