import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DELAWARE_DATA,DELAWARE_FIELDS,delawareRecord,delawareTaxBusinesses,lookupDelawareBusiness} from './registry-delaware.mjs';
import {DC_SERVICE,DC_BUSINESS_FIELDS,DC_OWNER_FIELDS,dcRecord,dcTaxBusinesses,lookupDcBusiness} from './registry-dc.mjs';
import {lookupStateBusiness,stateTaxBusinesses} from './state-registry.mjs';
import {localDiscovery} from './local-discovery.mjs';

const deRow=(extra={})=>({license_number:'999000001',business_name:'Synthetic Licensee LLC',trade_name:'Synthetic Delaware Tax',category:'GENERAL SERVICES',address_1:'12 Fixture Road',address_2:'Suite 2',city:'DOVER',state:'DE',zip:'19901',current_license_valid_from:'2026-01-01T00:00:00.000',current_license_valid_to:'2099-12-31T00:00:00.000',...extra});
const dcRow=(extra={})=>({FILE_NUMBER:'LC999001',BUSINESS_NAME:'Synthetic District Accounting LLC',ENTITY_STATUS:'Active - In Good Standing',MODELTYPE:'Domestic Limited Liability Company',BUSNIESS_ADDRESS_LINE1:'12 Fixture Road',BUSINESS_CITY:'Washington',BUSINESS_STATE:'DC',ZIPCODE:'20001',RA_NAME:'Synthetic Agent',DCS_LAST_MOD_DTTM:1794487682000,...extra});
const features=(rows,extra={})=>Response.json({features:rows.map(attributes=>({attributes,geometry:{x:999,y:999}})),...extra});

test('Delaware discovers trade names and CPA firms, keeps chain identity, and queries current dates with fixed business-only fields',async()=>{
  const rows=[deRow(),deRow({license_number:'999000002',business_name:'Synthetic Jones CPA PA',trade_name:''}),deRow({license_number:'999000003',business_name:'Synthetic Tax Licensee',trade_name:'H&R BLOCK'}),deRow({license_number:'999000004',business_name:'Synthetic Taxi Company',trade_name:'Synthetic Taxidermy'})];
  const result=await delawareTaxBusinesses("O'Fallon fixture",async raw=>{
    const url=new URL(raw);assert.equal(url.origin,new URL(DELAWARE_DATA).origin);assert.equal(url.searchParams.get('$select'),DELAWARE_FIELDS);assert.equal(url.searchParams.get('$limit'),'501');
    assert.match(url.searchParams.get('$where'),/O''FALLON FIXTURE/);assert.match(url.searchParams.get('$where'),/upper\(trade_name\)/);assert.match(url.searchParams.get('$where'),/current_license_valid_to >= '\d{4}-\d{2}-\d{2}T/);
    return Response.json(rows);
  });
  assert.equal(result.results.length,3);assert.equal(result.results[0].name,'Synthetic Delaware Tax');assert.equal(result.results[0].legalName,'Synthetic Licensee LLC');assert.equal(result.results[0].principals.length,0);
  const chain=result.results[2];assert.equal(chain.name,'H&R BLOCK');assert.equal(chain.legalName,'Synthetic Tax Licensee');
  assert.equal(chain.licenseValidTo,'2099-12-31');assert.match(chain.sourceNote,/not an owner/);assert(!chain.location);
});

test('Delaware selected licenses retain their full office identity across multiple licensed locations and units',async()=>{
  const row=deRow(),candidate=delawareRecord(row);
  const result=await lookupDelawareBusiness(candidate,async raw=>{
    const url=new URL(raw);assert.match(url.searchParams.get('$where'),/license_number=999000001/);assert.equal(url.searchParams.get('$limit'),'25');
    return Response.json([deRow({address_1:'99 Different Road'}),deRow({address_2:'Suite 3'}),row]);
  });
  assert.equal(result.matches.length,1);assert.equal(result.matches[0].match,'registry_record');assert.equal(result.matches[0].address,'12 Fixture Road, Suite 2');
  const source=new URL(result.matches[0].sourceURL);assert.match(source.searchParams.get('$where'),/address_2='Suite 2'/);
  const legal=await lookupDelawareBusiness({...candidate,name:row.business_name,registryId:undefined},async()=>Response.json([row]));
  assert.equal(legal.matches[0].match,'name_and_address');assert.equal(legal.matches[0].name,row.trade_name);
  await assert.rejects(lookupDelawareBusiness({...candidate,registryId:"license:1' OR true"},()=>{throw Error('Must not fetch');}),/Invalid/);
});

test('Delaware source links identify the actual published legal name, DBA and location without owner inference',()=>{
  const record=delawareRecord(deRow({business_name:"Synthetic O'Neil CPA",trade_name:'',geocoded_location:{latitude:1},owner:'EXCLUDED OWNER'}));
  const where=new URL(record.sourceURL).searchParams.get('$where');assert.match(where,/O''Neil CPA/);assert.match(where,/trade_name=''/);
  assert.equal(record.principals.length,0);assert.equal(record.registeredAgents.length,0);assert(!JSON.stringify(record).includes('EXCLUDED'));assert(!record.location);
});

test('D.C. discovery bounds queries, escapes localities, and excludes agent addresses and source geometry',async()=>{
  const result=await dcTaxBusinesses("O'Fallon fixture",async raw=>{
    const url=new URL(raw);assert.equal(url.origin,new URL(DC_SERVICE).origin);assert.equal(url.searchParams.get('outFields'),DC_BUSINESS_FIELDS);assert.equal(url.searchParams.get('returnGeometry'),'false');assert.equal(url.searchParams.get('resultRecordCount'),'501');
    assert(!/RA_ADDRESS|RA_CITY|RA_ZIP/.test(url.searchParams.get('outFields')));assert.match(url.searchParams.get('where'),/O''FALLON FIXTURE/);
    return features([dcRow({RA_ADDRESS1:'EXCLUDED PERSONAL ADDRESS'}),dcRow({FILE_NUMBER:'LC999002',BUSINESS_NAME:'Synthetic Taxi'})],{exceededTransferLimit:true});
  });
  assert.equal(result.results.length,1);assert.equal(result.truncated,true);const record=result.results[0];
  assert.equal(record.principals.length,0);assert.equal(record.registeredAgents[0].verifiedOwner,false);assert.equal(record.sourceUpdatedAt,'2026-11-12');
  assert.match(record.attribution,/CC BY 4.0/);assert(!JSON.stringify(record).includes('EXCLUDED'));assert(!record.location);
});

test('D.C. owners join only the selected filing and business name, omit personal addresses, and remain unverified',async()=>{
  const candidate=dcRecord(dcRow()),requests=[];
  const result=await lookupDcBusiness(candidate,async raw=>{
    const url=new URL(raw);requests.push(url);
    if(url.pathname.endsWith('/0/query'))return features([dcRow()]);
    assert(url.pathname.endsWith('/2/query'));assert.equal(url.searchParams.get('outFields'),DC_OWNER_FIELDS);assert(!url.searchParams.get('outFields').includes('ADDRESS'));
    assert.equal(url.searchParams.get('where'),"INITIALFILENUMBER='LC999001'");assert.equal(url.searchParams.get('resultRecordCount'),'101');
    const owner={INITIALFILENUMBER:'LC999001',NAME:'Synthetic Owner',BUSINESSNAME:candidate.legalName,ADDRESS:'EXCLUDED PERSONAL ADDRESS',DCS_LAST_MOD_DTTM:1794487682000};
    return features([owner,{...owner},{...owner,INITIALFILENUMBER:'OTHER',NAME:'EXCLUDED OTHER FILING'},{...owner,BUSINESSNAME:'Unrelated LLC',NAME:'EXCLUDED WRONG BUSINESS'}]);
  });
  assert.equal(requests.length,2);const record=result.matches[0];assert.equal(record.match,'registry_record');assert.equal(record.principals.length,1);assert.equal(record.principals[0].verifiedOwner,false);
  assert.match(record.principals[0].role,/beneficial-owner table/);assert.match(record.principalIssue,/conflicts/);assert(!JSON.stringify(record).includes('EXCLUDED'));
  assert.equal(record.registeredAgents[0].name,'Synthetic Agent');assert.notEqual(record.principals[0].name,record.registeredAgents[0].name);
  const source=new URL(record.principals[0].sourceURL);assert.equal(source.searchParams.get('outFields'),DC_OWNER_FIELDS);
});

test('D.C. unavailable owner tables preserve the business record and explain the missing evidence',async()=>{
  const report=await lookupDcBusiness(dcRecord(dcRow()),async raw=>String(raw).includes('/0/query')?features([dcRow()]):features([{INITIALFILENUMBER:'LC999001',BUSINESSNAME:'Missing name field'}]));
  assert.equal(report.matches.length,1);assert.equal(report.matches[0].principals.length,0);assert.match(report.matches[0].principalIssue,/could not be loaded/);
});

test('new source outages and schema changes retain honest unavailable status with official fallback links',async()=>{
  const de=await lookupStateBusiness({state:'DE',name:'Synthetic Tax'},async()=>Response.json([{unexpected:'schema'}]));
  assert.equal(de.available,false);assert.equal(de.matches.length,0);assert(de.links.some(item=>/revenue business-license/.test(item.label)));
  const dc=await lookupStateBusiness({state:'DC',name:'Synthetic Tax'},async()=>Response.json({error:{code:503}}));
  assert.equal(dc.available,false);assert.equal(dc.matches.length,0);assert(dc.links.length);
  await assert.rejects(stateTaxBusinesses('DC','Washington',async()=>new Response('Unavailable',{status:503})),/HTTP 503/);
});

test('D.C. filing owner names carry their official source into the existing principal contact-research token',async()=>{
  const fetcher=async raw=>String(raw).includes('/0/query')?features([dcRow()]):features([{INITIALFILENUMBER:'LC999001',NAME:'Synthetic Owner',BUSINESSNAME:dcRow().BUSINESS_NAME}]);
  const app=localDiscovery({GIGTAX_SALES_SESSION_KEY:'a'.repeat(64)},{fetcher,discoverer:async()=>({total:0,results:[],locality:'Washington'}),search:async()=>({results:[]}),placeLookup:()=>({matches:[],candidates:[],evidence:[],issues:[]})});
  const user={role:'agent',id:'fixture',states:['DC'],townAssignments:{DC:['Washington']}};
  const search=await app(user,'search-local',{state:'DC',city:'Washington'});assert.equal(search.registrySupported,true);assert.equal(search.results.length,1);
  const report=await app(user,'lookup-business',{candidateToken:search.results[0].candidateToken}),principal=report.matches[0].principals[0];
  const contact=await app(user,'research-local-contacts',{candidateToken:principal.researchToken});
  assert(contact.evidence.some(item=>item.field==='contact'&&item.value==='Synthetic Owner'&&item.sourceURL===principal.sourceURL));
  assert.equal(principal.verifiedOwner,false);
});
