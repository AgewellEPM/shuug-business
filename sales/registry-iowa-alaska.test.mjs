import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IOWA_CATALOG,IOWA_FIELDS,createIowaQuery,parseIowaResult} from './iowa-data.mjs';
import {iowaRecord,iowaTaxBusinesses,lookupIowaBusiness} from './registry-iowa.mjs';
import {ALASKA_LAYER,alaskaRecord,alaskaTaxBusinesses,lookupAlaskaBusiness} from './registry-alaska.mjs';
import {lookupStateBusiness} from './state-registry.mjs';

const iowaRow={corp_number:'990001',legal_name:'Synthetic Tax LLC',corporation_type:'LLC',effective_date:'2026-01-01',registered_agent:'Synthetic Agent',ho_address_1:'12 Fixture Road',ho_address_2:'',ho_city:'Des Moines',ho_state:'IA',ho_zip:'50309'};
function flight(rows,total=rows.length,keys=IOWA_FIELDS) {
  const value={success:true,value:{result:{count:total,data:{schema:Object.fromEntries(keys.map(key=>[key,'STRING'])),rows:rows.map(row=>keys.map(key=>row[key] || ''))}}}};
  return '0:{"a":"$@1"}\n1:'+JSON.stringify(value)+'\n';
}
function iowaFetcher(onQuery) {
  return async (url,options={})=>{
    assert.equal(new URL(url).origin,'https://data.iowa.gov');
    if(options.method==='POST')return onQuery(JSON.parse(options.body),options);
    if(String(url)===IOWA_CATALOG)return new Response('iowa_data_hub_gold_prod.active_business_entities<script src="/_next/static/chunks/catalog.js"></script><script src="https://outside.example/evil.js"></script>');
    assert.equal(new URL(url).pathname,'/_next/static/chunks/catalog.js');
    return new Response(`(0,s.createServerReference)("${'a'.repeat(40)}",s.callServer,void 0,s.findSourceMapURL,"getQueryPreview");globalThis.__sourceExecuted=true;`);
  };
}

test('Iowa resolves the current public query reference without executing downloaded scripts and safely selects business fields',async()=>{
  let calls=0;
  const fetcher=iowaFetcher(async(args,options)=>{
    calls++;assert.equal(args[0],'554');assert.equal(args[2],1);assert.equal(args[3],500);assert.equal(args[4],true);
    assert.equal(options.headers['Next-Action'],'a'.repeat(40));assert.equal(options.headers.Origin,'https://data.iowa.gov');
    assert(args[1].startsWith('SELECT '+IOWA_FIELDS.join(',')));assert(!/ra_address|ra_city|ra_zip|taxpayer_number/.test(args[1]));
    assert(args[1].includes("O\\'NEIL\\\\TOWN"));
    return new Response(flight([iowaRow],501));
  });
  const result=await iowaTaxBusinesses("O'NEIL\\TOWN",fetcher);
  assert.equal(result.results.length,1);assert.equal(result.truncated,true);assert.equal(calls,1);assert.equal(globalThis.__sourceExecuted,undefined);
  const record=result.results[0];assert.equal(record.principals.length,0);assert.equal(record.registeredAgents.length,1);
  assert.equal(record.sourceURL,IOWA_CATALOG);assert.match(record.attribution,/CC BY/);
});

test('Iowa rejects unexpected private fields and malformed results rather than silently publishing them',()=>{
  assert.throws(()=>parseIowaResult(flight([iowaRow],1,[...IOWA_FIELDS,'ra_address_1'])),/schema changed/);
  assert.throws(()=>parseIowaResult('0:{"a":"$@1"}\n1:{"success":false,"error":"backend unavailable"}\n'),/unavailable/);
  assert.throws(()=>parseIowaResult('<html>Challenge</html>'),/unsupported/);
  assert.throws(()=>parseIowaResult(flight([iowaRow],0)),/schema changed/);
  assert.equal(parseIowaResult(flight([{...iowaRow,legal_name:'$$Synthetic Tax'}])).rows[0].legal_name,'$Synthetic Tax');
  assert.throws(()=>parseIowaResult(flight([{...iowaRow,legal_name:'$3'}])),/encoded/);
  const record=iowaRecord({...iowaRow,ra_address_1:'EXCLUDED PERSONAL ADDRESS'});
  assert(!JSON.stringify(record).includes('EXCLUDED'));assert(!record.location);
  assert.match(record.registeredAgents[0].role,/not an owner/);
});

test('Iowa refreshes a rotated public action once, round-trips selected IDs, and caches bounded successful rows',async()=>{
  let catalogReads=0,posts=0;
  const fetcher=async (url,options={})=>{
    if(options.method==='POST'){
      posts++;if(posts===1)return new Response('Stale',{status:404,headers:{'x-nextjs-action-not-found':'1'}});
      assert.equal(options.headers['Next-Action'],'b'.repeat(40));
      assert.match(JSON.parse(options.body)[1],/corp_number='990001'/);return new Response(flight([iowaRow]));
    }
    if(String(url)===IOWA_CATALOG){catalogReads++;return new Response('iowa_data_hub_gold_prod.active_business_entities<script src="/_next/static/chunks/catalog.js"></script>');}
    return new Response(`(0,s.createServerReference)("${(catalogReads===1?'a':'b').repeat(40)}",s.callServer,void 0,s.findSourceMapURL,"getQueryPreview")`);
  };
  const record=iowaRecord(iowaRow),first=await lookupIowaBusiness(record,fetcher),again=await lookupIowaBusiness(record,fetcher);
  assert.equal(catalogReads,2);assert.equal(posts,2);assert.equal(first.matches[0].match,'registry_record');assert.deepEqual(first.matches,again.matches);
  await assert.rejects(createIowaQuery(fetcher)('TRUE',502),/limit/);
});

const akRow=(id,name,city='ANCHORAGE')=>({OBJECTID:9900+id,LicenseNumber:String(id),BusinessName:name,Owners:'Synthetic Owner LLC',Status:'Active',ExpireDate:1798707600000,created_date:1793610000000,PhysicalLine1:'42 Fixture Road',PhysicalCity:city,PhysicalState:'AK',PhysicalZipOut:'99501',MailingLine1:'EXCLUDED MAILING ADDRESS'});
test('Alaska searches bounded literal business names, filters localities, preserves source limits and excludes community-centroid pins',async()=>{
  const calls=[],rows=[akRow(991001,'Synthetic Tax LLC'),akRow(991002,'Synthetic Accounting'),akRow(991003,'Synthetic Taxi'),akRow(991004,'Other Tax LLC','JUNEAU')];
  const result=await alaskaTaxBusinesses('Anchorage',async (url,options)=>{
    assert.equal(url,ALASKA_LAYER+'/query');assert.equal(options.method,'POST');
    const p=new URLSearchParams(options.body);calls.push(p.get('text'));assert.equal(p.get('where'),null);assert.equal(p.get('resultRecordCount'),'500');assert.equal(p.get('returnGeometry'),'false');
    assert(!/Mailing|IssueDate/.test(p.get('outFields')));
    return Response.json({features:rows.map(attributes=>({attributes,geometry:{x:123,y:45}})),exceededTransferLimit:true});
  });
  assert.deepEqual(calls.sort(),['ACCOUNT','BOOKKEEP','TAX']);assert.equal(result.results.length,2);assert.equal(result.truncated,true);
  const record=result.results[0];assert(!record.location);assert(!JSON.stringify(record).includes('EXCLUDED'));assert.equal(record.sourceUpdatedAt,'2026-11-02');
  assert.equal(record.principals[0].verifiedOwner,false);assert.match(record.principals[0].role,/person or entity/);assert.match(record.sourceNote,/12%/);
  const url=new URL(record.sourceURL);assert.equal(url.searchParams.get('objectIds'),String(rows[0].OBJECTID));assert.equal(url.searchParams.get('returnGeometry'),'false');
});

test('Alaska license identities remain distinct from entity IDs, and principal lookup checks the selected ID',async()=>{
  const row=akRow(991010,'Synthetic License Tax'),record=alaskaRecord(row);
  const result=await lookupAlaskaBusiness(record,async (url,options)=>{
    const p=new URLSearchParams(options.body);assert.equal(p.get('where'),"LicenseNumber='991010'");assert.equal(p.get('resultRecordCount'),'25');
    return Response.json({features:[{attributes:row}]});
  });
  assert.equal(result.matches[0].registryId,'license:991010');assert.equal(result.matches[0].match,'registry_record');assert.match(result.message,/not a complete/);
  await assert.rejects(lookupAlaskaBusiness({...record,registryId:'../bad'},()=>{throw Error('Must not fetch');}),/Invalid/);
});

test('new source outages remain unavailable with official fallback links and no fabricated owner findings',async()=>{
  const ia=await lookupStateBusiness({name:'Synthetic Iowa outage',state:'IA'},async()=>new Response('Offline',{status:503}));
  assert.equal(ia.available,false);assert(ia.links.length);assert.equal(ia.matches.length,0);
  const ak=await lookupStateBusiness({name:'Synthetic Alaska outage',state:'AK'},async()=>Response.json({error:{code:400,message:'Unavailable'}}));
  assert.equal(ak.available,false);assert.equal(ak.matches.length,0);assert(ak.links.some(link=>/primary business-license/.test(link.label)));
});
