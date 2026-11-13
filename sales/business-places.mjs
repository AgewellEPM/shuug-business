import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {HttpError,STATES,digest,https} from './model.mjs';
import {localityKey} from './territory-access.mjs';
import {normalizedBusiness,matchBusiness} from './registry-matching.mjs';

const directory=new URL('./business-places-data/',import.meta.url);
const sourceName='Overture Maps business-place catalogue';
const labels={name_and_address:'Name and street address match',related_name_and_address:'Related name and street address match',name_and_phone:'Name and business phone match',name_and_city:'Name and town match; street address needs review'};
const digits=value=>String(value || '').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const ordinaryPhone=value=>/^\d{10}$/.test(value) && !/^(800|833|844|855|866|877|888)/.test(value);
const url=value=>{try{return https(value);}catch{return '';}};
// Suite/unit identifiers remain part of contact matching, even when the broader
// registry comparison treats them as the same building.
const streetKey=value=>String(value || '').toUpperCase().replace(/\b(?:STREET|ROAD|AVENUE|BOULEVARD|DRIVE|LANE|COURT|PLACE|SUITE|STE)\b/g,word=>({STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',PLACE:'PL',SUITE:'UNIT',STE:'UNIT'})[word]).replace(/[^A-Z0-9]/g,'');

export function matchBusinessPlace(candidate,record) {
  if(record.state!==candidate.state || !candidate.city || localityKey(candidate.city)!==localityKey(record.city))return null;
  const comparison=matchBusiness(candidate,record),sameName=normalizedBusiness(candidate.name)===normalizedBusiness(record.name);
  const name=normalizedBusiness(candidate.name),meaningful=name.length>3 && !/^(TAX|TAXSERVICE|TAXSERVICES|ACCOUNTING|ACCOUNTANT|BOOKKEEPING|BOOKKEEPER)$/.test(name);
  const phone=digits(candidate.phone),samePhone=ordinaryPhone(phone) && record.phones.some(value=>digits(value)===phone);
  const sameStreet=Boolean(streetKey(candidate.address)) && streetKey(candidate.address)===streetKey(record.address);
  let match;
  if(sameName && sameStreet)match='name_and_address';
  else if(comparison?.match==='related_name' && sameStreet)match='related_name_and_address';
  if(!match && sameName && meaningful)match=samePhone?'name_and_phone':'name_and_city';
  return match?{...record,match,matchLabel:labels[match],score:({name_and_address:5,related_name_and_address:4,name_and_phone:4,name_and_city:2})[match],contactMatch:match!=='name_and_city'}:null;
}

export function placeSourceURL(record) {
  const link=new URL('https://explore.overturemaps.org/');
  link.searchParams.set('feature',`places.place.${record.id}`);
  link.searchParams.set('mode','inspect');
  if(record.sourcePoint)link.hash=`18/${record.sourcePoint[0]}/${record.sourcePoint[1]}`;
  return link.href;
}

export function createBusinessPlaceLookup({read=readFileSync,root=directory}={}) {
  let manifest;
  const cache=new Map();
  const getManifest=()=>{
    if(!manifest) {
      const value=JSON.parse(read(new URL('manifest.json',root),'utf8'));
      if(value.schemaVersion!==1 || !/^20\d{2}-\d{2}-\d{2}\.\d+$/.test(value.release) || value.states.length!==51 ||
        new Set(value.states.map(row=>row.state)).size!==51 || value.states.some(row=>!STATES.includes(row.state)||!Number.isInteger(row.records)||row.records<1||! /^[a-f0-9]{64}$/.test(row.sha256)))
        throw new HttpError(502,'The published business-contact catalogue needs repair.');
      manifest=value;
    }
    return manifest;
  };
  const load=state=>{
    if(!STATES.includes(state))throw new HttpError(400,'Choose a US state or DC.');
    if(cache.has(state))return cache.get(state);
    const entry=getManifest().states.find(row=>row.state===state),bytes=read(new URL(state+'.json.gz',root));
    if(bytes.length>8*1024*1024 || digest(bytes)!==entry.sha256)throw new HttpError(502,'The business-contact catalogue failed its source check.');
    const rows=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}).toString('utf8'));
    if(!Array.isArray(rows)||rows.length!==entry.records||rows.some(row=>row.state!==state || !/^[a-f0-9-]{36}$/.test(row.id) ||
      typeof row.name!=='string'||typeof row.city!=='string'||typeof row.address!=='string'||!Array.isArray(row.websites)||!Array.isArray(row.phones)||!Array.isArray(row.emails)||!Array.isArray(row.sources)))
      throw new HttpError(502,'The business-contact catalogue schema changed.');
    const cities=new Map();for(const row of rows){const key=localityKey(row.city);if(!cities.has(key))cities.set(key,[]);cities.get(key).push(row);}
    if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(state,cities);return cities;
  };
  return {
    coverage(state) {const value=getManifest(),entry=value.states.find(row=>row.state===state);return entry?{mode:'published_business_places',release:value.release,records:entry.records,withWebsite:entry.withWebsite,withPhone:entry.withPhone,withEmail:entry.withEmail,sourceURL:value.sourceURL}:null;},
    lookup(candidate) {
      const snapshot=getManifest(),local=load(candidate.state).get(localityKey(candidate.city)) || [];
      const matches=local.map(row=>matchBusinessPlace(candidate,row)).filter(Boolean).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,6);
      const candidates=[],evidence=[];
      for(const record of matches) {
        const sourceURL=placeSourceURL(record),observedDates=[...new Set(record.sources.map(row=>row.update_time?.slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '')))].sort();
        const provenance={sourceName,sourceURL,sourceRecordId:record.id,sourceRelease:snapshot.release,sourceObservedDates:observedDates};
        const address=[record.address,record.city,record.state,record.zip].filter(Boolean).join(', ');
        for(const value of record.websites){const website=url(value);if(website)candidates.push({url:website,title:record.name,snippet:`${address}. ${record.matchLabel}. Published website; confirm the current business connection.`,...provenance});}
        if(record.contactMatch)for(const [field,values] of [['phone',record.phones],['email',record.emails]])for(const value of values.slice(0,4))evidence.push({
          id:digest(`${field}:${value}:${sourceURL}`).slice(0,20),field,value,scope:'business',confidence:'published',...provenance,
          excerpt:`${record.name} · ${address}. ${record.matchLabel}. Published business channel; current ownership and deliverability unverified.`});
      }
      return {status:matches.length?'matches':'no_match',release:snapshot.release,sourceName,sourceURL:snapshot.sourceURL,
        attribution:'Overture Maps Foundation and source contributors. CDLA Permissive 2.0, Apache 2.0 and CC0.',
        attributionURL:'https://gigtax.pro/business-data-attribution.txt',
        candidates:[...new Map(candidates.map(row=>[row.url,row])).values()].slice(0,8),
        evidence:[...new Map(evidence.map(row=>[`${row.field}:${row.value}:${row.sourceURL}`,row])).values()].slice(0,8),
        matches:matches.map(({id,name,address,city,state,match,matchLabel,contactMatch})=>({id,name,address,city,state,match,matchLabel,contactMatch})),
        limits:'Published place records can be incomplete or outdated. A name/town-only match supplies website suggestions, not contact-field evidence. Source review is required; no owner identity is inferred.'};
    },
  };
}
const catalogue=createBusinessPlaceLookup();
export const lookupBusinessPlaces=candidate=>catalogue.lookup(candidate);
export const businessPlaceCoverage=state=>catalogue.coverage(state);
