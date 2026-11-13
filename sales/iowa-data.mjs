import {HttpError} from './model.mjs';
import {publicText} from './public-data.mjs';

export const IOWA_CATALOG='https://data.iowa.gov/catalog/dataset/554';
const TABLE='iowa_data_hub_gold_prod.active_business_entities';
export const IOWA_FIELDS=['corp_number','legal_name','corporation_type','effective_date','registered_agent','ho_address_1','ho_address_2','ho_city','ho_state','ho_zip'];
const clients=new WeakMap();
const fail=message=>new HttpError(502,`Iowa public data: ${message}`);

export function parseIowaResult(raw) {
  // Read only the JSON action result. Never execute the site's scripts or Flight.
  const header=raw.match(/^0:(\{.*\})$/m);
  const reference=header && JSON.parse(header[1]).a;
  if(typeof reference!=='string' || !/^\$@[0-9a-f]+$/.test(reference))throw fail('unsupported query response.');
  const line=raw.split('\n').find(line=>line.startsWith(reference.slice(2)+':'));
  if(!line)throw fail('missing query result.');
  let payload;
  try{payload=JSON.parse(line.slice(line.indexOf(':')+1));}catch{throw fail('unsupported query result.');}
  if(payload.success!==true)throw fail('the public query was unavailable. Use the official search or retry.');
  const result=payload.value?.result, data=result?.data, keys=Object.keys(data?.schema || {});
  if(!keys.length || keys.some(key=>!IOWA_FIELDS.includes(key)) || !keys.includes('corp_number') || !keys.includes('legal_name') ||
    !Array.isArray(data?.rows) || data.rows.length>500 || !Number.isInteger(result.count) || result.count<data.rows.length)
    throw fail('the business query schema changed.');
  const rows=data.rows.map(row=>{
    if(!Array.isArray(row) || row.length!==keys.length || row.some(value=>value!==null && typeof value!=='string'))throw fail('unsupported business row.');
    return Object.fromEntries(keys.map((key,i)=>{
      const value=row[i] || '';
      if(value.startsWith('$') && !value.startsWith('$$'))throw fail('unsupported encoded business field.');
      return [key,value.startsWith('$$')?value.slice(1):value];
    }));
  });
  return {rows,total:result.count};
}

export function createIowaQuery(fetcher=fetch) {
  let configuration,loading;
  const cache=new Map();
  const get=async(url,signal)=>publicText(await fetcher(url,{signal,redirect:'error',headers:{Accept:'text/html,application/javascript','User-Agent':'GigTaxResearch/1.0 (+https://gigtax.pro/privacy)'}}));
  async function settings(signal) {
    if(configuration?.expires>Date.now())return configuration;
    if(loading)return loading;
    loading=(async()=>{
      const html=await get(IOWA_CATALOG,signal);
      if(!html.includes(TABLE))throw fail('the published business dataset changed.');
      const scripts=[...html.matchAll(/<script\b([^>]*\bsrc="(\/_next\/static\/chunks\/[A-Za-z0-9_-]+\.js)"[^>]*)>/gi)]
        .filter(match=>! /\bnoModule\b/i.test(match[1])).map(match=>match[2]);
      const urls=[...new Set(scripts)].slice(-6);
      const responses=await Promise.allSettled(urls.map(url=>get(new URL(url,IOWA_CATALOG).href,signal)));
      let action;
      for(const response of responses)if(response.status==='fulfilled') {
        action=response.value.match(/createServerReference\)\(\s*["']([a-f0-9]{40,64})["'][^;\n]{0,240}?["']getQueryPreview["']\s*\)/)?.[1];
        if(action)break;
      }
      if(!action)throw fail('the public data viewer could not be loaded.');
      configuration={action,expires:Date.now()+3600000};return configuration;
    })();
    try{return await loading;}finally{loading=undefined;}
  }
  return async function query(where,limit=501) {
    if(!Number.isInteger(limit)||limit<1||limit>501)throw fail('unsupported query limit.');
    const sql=`SELECT ${IOWA_FIELDS.join(',')} FROM \`${TABLE}\` WHERE ${where} ORDER BY corp_number LIMIT ${limit}`;
    const old=cache.get(sql);if(old?.expires>Date.now())return structuredClone(old.value);
    const deadline=AbortSignal.timeout(35000);
    for(let attempt=0;attempt<2;attempt++) {
      const config=await settings(AbortSignal.any([deadline,AbortSignal.timeout(15000)]));
      const response=await fetcher(IOWA_CATALOG,{method:'POST',redirect:'error',signal:AbortSignal.any([deadline,AbortSignal.timeout(15000)]),
        headers:{'Content-Type':'text/plain;charset=UTF-8',Accept:'text/x-component',Origin:new URL(IOWA_CATALOG).origin,'Next-Action':config.action},
        // This is the public viewer's unauthenticated read-only query operation.
        body:JSON.stringify(['554',sql,1,Math.min(limit,500),true])});
      if(response.status===404 && response.headers.get('x-nextjs-action-not-found')==='1') {
        await response.body?.cancel();configuration=undefined;
        if(attempt===0)continue;
      }
      const value=parseIowaResult(await publicText(response));
      if(cache.size>=150)cache.delete(cache.keys().next().value);
      cache.set(sql,{value,expires:Date.now()+3600000});return structuredClone(value);
    }
    throw fail('the public viewer changed. Retry the search.');
  };
}
export function queryIowa(where,limit,fetcher=fetch) {
  if(!clients.has(fetcher))clients.set(fetcher,createIowaQuery(fetcher));
  return clients.get(fetcher)(where,limit);
}
