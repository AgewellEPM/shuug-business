import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {STATES,digest} from './model.mjs';
import {createBusinessPlaceLookup,matchBusinessPlace,placeSourceURL} from './business-places.mjs';

const row={id:'12345678-1234-1234-1234-123456789abc',name:'Synthetic Tax LLC',address:'12 Fixture Road',city:'Hartford',state:'CT',zip:'06103',
  websites:['https://fixture-business.org/'],phones:['+18602469999'],emails:['office@fixture-business.org'],sources:[{dataset:'Synthetic',update_time:'2026-09-01T00:00:00Z'}],sourcePoint:[41.76,-72.68]};
const candidate={name:'Synthetic Tax',address:'12 Fixture Rd',city:'HARTFORD',state:'CT',phone:'8602469999'};
function catalogue(change=()=>{}) {
  const files=new Map(),states=[];
  for(const state of STATES){const bytes=gzipSync(JSON.stringify([{...row,state}]));files.set(state+'.json.gz',bytes);states.push({state,records:1,withWebsite:1,withPhone:1,withEmail:1,sha256:digest(bytes)});}
  const manifest={schemaVersion:1,release:'2026-10-21.0',sourceURL:'https://docs.overturemaps.org/guides/places/',states};
  change(files,manifest);files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
  let reads=0;
  const lookup=createBusinessPlaceLookup({root:new URL('file:///fixture/'),read:path=>{reads++;const bytes=files.get(new URL(path).pathname.split('/').pop());assert(bytes);return bytes;}});
  return {...lookup,reads:()=>reads};
}

test('place matching requires state/locality and separates name-only website suggestions from contact-field evidence',()=>{
  assert.equal(matchBusinessPlace(candidate,row).match,'name_and_address');
  assert.equal(matchBusinessPlace({...candidate,state:'MA'},row),null);
  assert.equal(matchBusinessPlace({...candidate,city:'New Haven'},row),null);
  const weak=matchBusinessPlace({...candidate,address:'99 Other Rd',phone:''},row);
  assert.equal(weak.match,'name_and_city');assert.equal(weak.contactMatch,false);
  assert.equal(matchBusinessPlace({...candidate,name:'Unrelated Property Company'},row),null);
  assert.equal(matchBusinessPlace({...candidate,name:'Other Tax',address:'12 Different Road',phone:''},row),null);
  assert.equal(matchBusinessPlace({...candidate,name:'Tax Services',address:'99 Other Rd'}, {...row,name:'Tax Services'}),null);
  assert.equal(matchBusinessPlace({...candidate,address:'12 Fixture Road, Suite 1',phone:''},{...row,address:'12 Fixture Rd, Suite 2'}).contactMatch,false,'different suites cannot merge contact channels on a building match');
});

test('place phone matches require the same business name and a non-toll-free published business channel',()=>{
  assert.equal(matchBusinessPlace({...candidate,address:'99 Other Rd'},row).match,'name_and_phone');
  const tollFree={...row,phones:['+18002469999']};
  assert.equal(matchBusinessPlace({...candidate,address:'99 Other Rd',phone:'8002469999'},tollFree).contactMatch,false);
  assert.equal(matchBusinessPlace({...candidate,name:'Different Tax'},row),null);
});

test('catalogue suggestions and business channels carry record/source dates without inventing owners or altering source addresses',()=>{
  const c=catalogue(),result=c.lookup(candidate);
  assert.equal(result.status,'matches');assert.equal(result.candidates.length,1);assert.equal(result.evidence.length,2);
  assert.equal(result.candidates[0].sourceRecordId,row.id);assert.equal(result.candidates[0].sourceRelease,'2026-10-21.0');
  assert.deepEqual(result.candidates[0].sourceObservedDates,['2026-09-01']);
  assert(result.evidence.every(item=>item.scope==='business' && ['phone','email'].includes(item.field)));
  const link=new URL(placeSourceURL(row));assert.equal(link.searchParams.get('feature'),'places.place.'+row.id);assert.equal(link.hash,'#18/41.76/-72.68');
  const weak=c.lookup({...candidate,address:'99 Other Rd',phone:''});assert.equal(weak.candidates.length,1);assert.equal(weak.evidence.length,0);
  assert.equal(c.reads(),2,'one manifest plus one verified state shard is reused');
  assert.equal(c.coverage('CT').records,1);assert.equal(c.coverage('PR'),null);
});

test('a catalogue never uses a changed shard, incorrect row state, or incomplete region manifest',()=>{
  assert.throws(()=>catalogue(files=>files.set('CT.json.gz',Buffer.from('corrupt'))).lookup(candidate),/source check/);
  assert.throws(()=>catalogue((files,manifest)=>{
    const bytes=gzipSync(JSON.stringify([{...row,state:'MA'}]));files.set('CT.json.gz',bytes);manifest.states.find(s=>s.state==='CT').sha256=digest(bytes);
  }).lookup(candidate),/schema changed/);
  assert.throws(()=>catalogue((_files,manifest)=>manifest.states.pop()).lookup(candidate),/needs repair/);
});
