import {HttpError} from './model.mjs';
import {publicText} from './public-data.mjs';
import {matchBusiness,normalizedBusiness} from './registry-matching.mjs';

export const KENTUCKY_SEARCH='https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx';
const origin=new URL(KENTUCKY_SEARCH).origin,caches=new WeakMap();
const hiddenNames=new Set(['__VIEWSTATE','__VIEWSTATEGENERATOR','__VIEWSTATEENCRYPTED','__EVENTVALIDATION',
  ...['hID','hComptype','hCompseq','hCerttype','hdnCompanyID','hdnCompType','hdnCompSeq','hdnCTR','hdnShowGoodStanding','hdnSelectedCertCode','hdnShowReinstatement','hdnShowARP','hdnARPText','hdnCertList'].map(name=>'ctl00$MainContent$'+name)]);
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,key)=>{
  if(key[0]!=='#')return entities[key.toLowerCase()]??all;
  const code=parseInt(key.slice(key[1].toLowerCase()==='x'?2:1),key[1].toLowerCase()==='x'?16:10);
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
});
const clean=value=>decode(String(value).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/\r/g,'').trim();
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w$-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
const profileURL=id=>`https://sosbes.sos.ky.gov/BusSearchNProfile/Profile.aspx/?ctr=${id}`;
const unavailable=()=>new HttpError(502,'Kentucky public business search is unavailable or its page format changed. Review the official source.');
function cacheFor(fetcher) {
  if(!caches.has(fetcher))caches.set(fetcher,new Map());return caches.get(fetcher);
}
function remember(cache,key,value) {
  if(cache.size>=120)cache.delete(cache.keys().next().value);
  cache.set(key,{value:structuredClone(value),expires:Date.now()+3600000});return value;
}
function form(html) {
  // Native read-only form state, never downloaded script execution. Certificates,
  // filings, payments and person-name searches are not submitted by this adapter.
  if(/turnstile|g-recaptcha|cf-chl-|challenge-platform/i.test(html))throw unavailable();
  const values={};
  for(const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const item=attrs(match[0]);
    if(item.type==='hidden'&&hiddenNames.has(item.name)&&String(item.value||'').length<=100000)values[item.name]=item.value||'';
  }
  if(!values.__VIEWSTATE)throw unavailable();return values;
}
async function request(url,context,body) {
  if(new URL(url).origin!==origin)throw unavailable();
  const response=await context.fetcher(url,{method:body?'POST':'GET',body,redirect:'error',signal:AbortSignal.any([context.signal,AbortSignal.timeout(15000)]),
    headers:{Accept:'text/html','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)',...(context.cookies.size?{Cookie:[...context.cookies].map(([key,value])=>key+'='+value).join('; ')}:{}),
      ...(body?{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Referer:url}:{})}});
  for(const cookie of response.headers.getSetCookie?.()||[]) {
    const pair=cookie.split(';')[0],index=pair.indexOf('=');
    if(index>0&&context.cookies.size<10)context.cookies.set(pair.slice(0,index),pair.slice(index+1));
  }
  return publicText(response);
}
export function parseKentuckySearch(html) {
  const label=html.match(/<span\b[^>]*id=["']MainContent_LblResults["'][^>]*>([\s\S]*?)<\/span>/i);
  const counts=label&&clean(label[1]).match(/(\d+) Results found\s*\((\d+) Results shown/i);
  if(!counts) {
    if(/id=["']MainContent_lblMessage["'][^>]*>\s*(?:No (?:results|records|matches)|There (?:are|were) no)/i.test(html))return {rows:[],truncated:false};
    throw unavailable();
  }
  const rows=[];
  for(const match of html.matchAll(/<a\b([^>]*\bid=["']MainContent_gvSearchResults_HlName_\d+["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href=attrs(match[1]).href||'',id=href.match(/^Profile\.aspx\/\?ctr=(\d{1,12})$/i)?.[1],name=clean(match[2]);
    if(!id||!name)throw unavailable();rows.push({profileId:id,name});
    if(rows.length>100)throw unavailable();
  }
  if(rows.length!==Number(counts[2]))throw unavailable();
  return {rows,truncated:Number(counts[1])>rows.length};
}
async function searchName(name,context) {
  const cache=cacheFor(context.fetcher),key='search:'+name.toUpperCase(),old=cache.get(key);
  if(old?.expires>Date.now())return structuredClone(old.value);
  const html=await request(KENTUCKY_SEARCH,context),values=form(html);
  if(!html.includes('ctl00$MainContent$txtSearch')||!html.includes('Business Name or Organization Number'))throw unavailable();
  const body=new URLSearchParams({...values,__EVENTTARGET:'ctl00$MainContent$BSearch',__EVENTARGUMENT:'',
    'ctl00$MainContent$txtSearch':name,'ctl00$MainContent$ddlSearchBy':'Business Name or Organization Number'});
  return remember(cache,key,parseKentuckySearch(await request(KENTUCKY_SEARCH,context,body)));
}
function generalFields(html) {
  const result=new Map();
  for(const match of html.matchAll(/<div\b[^>]*class=["']grid-label["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["']grid-value["'][^>]*>([\s\S]*?)<\/div>/gi))result.set(clean(match[1]),match[2]);
  return result;
}
export function parseKentuckyProfile(html,id) {
  if(!/^\d{1,12}$/.test(String(id)))throw unavailable();
  const fields=generalFields(html),businessId=clean(fields.get('Organization Number')||''),name=clean(fields.get('Name')||'');
  if(!/^\d{7,12}$/.test(businessId)||!name||!fields.has('Status')||!fields.has('Company Type'))throw unavailable();
  const lines=clean(fields.get('Principal Office')||'').split('\n').map(value=>value.trim()).filter(Boolean),place=lines.at(-1)?.match(/^(.*?),\s*([A-Z]{2}),?\s*(\d{5}(?:-\d{4})?)$/);
  const agent=clean((fields.get('Registered Agent')||'').split(/<br\s*\/?\s*>/i)[0]);
  const sourceURL=profileURL(id),annual=clean(fields.get('Last Annual Report')||'');
  // Only the principal business office is retained. Agent address lines and all
  // initial-officer/organizer fields are discarded, including from the cache.
  return {registryId:'profile:'+id,registryState:'KY',sourceKind:'state_registry',sourceName:'Kentucky Secretary of State business search',sourceURL,
    name,legalName:name,businessId,businessType:clean(fields.get('Company Type')),status:[clean(fields.get('Status')),clean(fields.get('Standing')||'')].filter(Boolean).join('; '),
    address:(place?lines.slice(0,-1):lines).join(', '),city:place?.[1]||'',state:place?.[2]||'KY',zip:place?.[3]||'',
    addressKind:'Published principal office; not a verified operating storefront',lastAnnualReport:annual,principals:[],email:'',
    registeredAgents:agent?[{name:agent,role:'Registered agent — not an owner finding',sourceURL,verifiedOwner:false}]:[],
    sourceNote:`Selected-business lookup only; sole proprietors are not included. Open the official record and choose Show Current Officers to review roles. Officers, managers and members are not automatically confirmed owners.${annual?' Last annual report shown: '+annual+'.':''}`};
}
export function parseKentuckyOfficers(html,record) {
  // Switching tabs removes General Information. Check the native profile's two
  // hidden business identifiers and visible business heading before taking names.
  const identity=new Map([...html.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(item=>item.type==='hidden').map(item=>[item.name,item.value]));
  const heading=html.match(/<span\b[^>]*id=["']MainContent_lblName["'][^>]*>([\s\S]*?)<\/span>/i);
  if(identity.get('ctl00$MainContent$hdnCompanyID')!==record.businessId||'profile:'+identity.get('ctl00$MainContent$hdnCTR')!==record.registryId||normalizedBusiness(clean(heading?.[1]||''))!==normalizedBusiness(record.name))throw unavailable();
  if(!html.includes('id="MainContent_pcurrent"'))throw unavailable();
  const names=new Map([...html.matchAll(/<a\b[^>]*id=["']MainContent_rptCurrentOfficers_LbOfficer_(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>[m[1],clean(m[2])])),people=[];
  for(const match of html.matchAll(/<span\b[^>]*id=["']MainContent_rptCurrentOfficers_LblTitle_(\d+)["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const name=names.get(match[1]),role=clean(match[2]);if(!name||!role)throw unavailable();
    if(people.length>=100)throw unavailable();
    people.push({name,role:`${role} (current-officer registry field; ownership unconfirmed)`,sourceURL:record.sourceURL+'#currentOfficersHeading',verifiedOwner:false});
  }
  if(people.length!==names.size)throw unavailable();return people;
}
async function profile(id,context) {
  const cache=cacheFor(context.fetcher),key='profile:'+id,old=cache.get(key);if(old?.expires>Date.now())return structuredClone(old.value);
  const url=profileURL(id),html=await request(url,context),record=parseKentuckyProfile(html,id);
  try {
    const values=form(html);
    if(!html.includes('name="ctl00$MainContent$BtnCurrent"'))throw unavailable();
    const body=new URLSearchParams({...values,'ctl00$MainContent$BtnCurrent':'Show Current Officers'});
    record.principals=parseKentuckyOfficers(await request(url,context,body),record);
  }catch {record.principalIssue='Current-officer names could not be loaded. Review Show Current Officers in the official profile; no owner can be inferred from this missing result.';}
  return record.principalIssue?record:remember(cache,key,record);
}
export async function lookupKentuckyBusiness(candidate,fetcher=fetch) {
  const context={fetcher,cookies:new Map(),signal:AbortSignal.timeout(40000)};let ids=[],truncated=false;
  if(candidate.registryId) {
    const id=String(candidate.registryId).match(/^profile:(\d{1,12})$/)?.[1];if(!id)throw new HttpError(400,'Invalid Kentucky profile identifier.');ids=[id];
  }else {
    const full=String(candidate.name||'').trim(),base=full.replace(/[,\s]+(?:L\.?L\.?C\.?|INCORPORATED|INC\.?|CORPORATION|CORP\.?|LLP|PC)\s*$/i,'').trim();
    if(!full||full.length>200)throw new HttpError(400,'Choose a business name for the Kentucky lookup.');
    for(const name of new Set([full,base].filter(Boolean))) {
      const report=await searchName(name,context);truncated||=report.truncated;
      ids=report.rows.filter(row=>normalizedBusiness(row.name)===normalizedBusiness(full)).map(row=>row.profileId);
      if(ids.length)break;
    }
  }
  ids=[...new Set(ids)];truncated||=ids.length>3;
  const records=[];
  // Serial reads keep native ASP.NET session/form state isolated per profile.
  for(const id of ids.slice(0,3))records.push(await profile(id,context));
  return {supported:true,matches:records.map(record=>matchBusiness(candidate,record)).filter(Boolean).sort((a,b)=>b.score-a.score),truncated,checkedAt:new Date().toISOString(),
    message:'Selected-business Kentucky legal-name lookup. Compare the legal name and principal office. Current officers, members and managers retain their registry roles; registered agents and initial organizers are not owner findings.'};
}
