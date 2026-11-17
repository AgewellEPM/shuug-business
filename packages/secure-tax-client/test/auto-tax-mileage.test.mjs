import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mileageDeduction} from '../browser/auto-tax-mileage.mjs';

const trip=(id,date='2025-03-01',body={})=>({id,body:{localDate:date,startedAt:`${date}T10:00:00Z`,endedAt:`${date}T11:00:00Z`,distanceMeters:1609.344,classification:'business',hasGaps:false,...body}});
const calculate=(trips,year=2025,options={eligible:true})=>mileageDeduction(trips,year,options);
const codes=result=>result.issues.map(issue=>issue.code);

test('pins dated IRS business rates, including the July 2026 increase, without inventing 2027',async()=>{
  const pin=JSON.parse(await readFile(new URL('../../../docs/verification/business-mileage-source-pin-20261117.json',import.meta.url),'utf8'));
  const actual=[2023,2024,2025,2026].flatMap(year=>calculate([],year).rates);
  assert.deepEqual(actual,pin.rates.map(({from,through,centsPerMile,sourceUrl})=>({from,through,centsPerMile,sourceUrl})));
  for(const rate of actual)assert.equal(new URL(rate.sourceUrl).hostname,'www.irs.gov');
  assert.deepEqual(actual.map(rate=>rate.centsPerMile),[65.5,67,70,72.5,76]);
  const unsupported=calculate([trip('unsupported','2027-03-01')],2027);
  assert.equal(unsupported.amountCents,null);assert.equal(unsupported.distanceMeters,1609.344);assert.deepEqual(unsupported.rates,[]);assert.ok(codes(unsupported).includes('unsupported-year'));
});

test('requires explicit eligibility, keeps usable distance visible, and returns zero only for an eligible empty year',()=>{
  for(const options of [undefined,{}, {eligible:false},{eligible:'true'}]) {
    const result=mileageDeduction([trip('business')],2025,options);
    assert.equal(result.amountCents,null);assert.equal(result.distanceMeters,1609.344);assert.ok(codes(result).includes('eligibility-required'));
  }
  assert.equal(calculate([]).amountCents,0);assert.deepEqual(calculate([]).issues,[]);
});

test('selects rates by recorded local date rather than UTC and uses both sides of July 1',()=>{
  const before=trip('june','2026-06-30',{startedAt:'2026-07-01T02:00:00Z',endedAt:'2026-07-01T03:00:00Z',timeZoneId:'America/New_York'});
  const after=trip('july','2026-07-01',{startedAt:'2026-07-01T15:00:00Z',endedAt:'2026-07-01T16:00:00Z',timeZoneId:'America/New_York'});
  const result=calculate([before,after],2026);
  assert.equal(result.amountCents,149);assert.equal(result.distanceMeters,3218.688);assert.deepEqual(result.issues,[]);
  assert.equal(calculate([trip('annual-2023','2023-03-01')],2023).amountCents,66);
  assert.equal(calculate([trip('annual-2024','2024-03-01')],2024).amountCents,67);
});

test('sums exact decimal meter fractions before rounding cents once, including exponent notation',()=>{
  const two=[trip('one','2023-03-01'),trip('two','2023-03-02')];
  assert.equal(calculate(two,2023).amountCents,131); // Not 66 + 66.
  const half=trip('half','2024-03-01',{distanceMeters:804.672});
  assert.equal(calculate([half],2024).amountCents,34); // Exactly 33.5 cents.
  assert.equal(calculate([trip('below','2024-03-01',{distanceMeters:804.671999})],2024).amountCents,33);
  assert.equal(calculate([trip('tiny','2025-03-01',{distanceMeters:1e-7})]).amountCents,0);
  const lots=Array.from({length:1000},(_,i)=>trip(`small-${i}`,'2025-03-01',{startedAt:Date.UTC(2025,2,1)+i*2000,endedAt:Date.UTC(2025,2,1)+i*2000+1000,distanceMeters:1.609344}));
  assert.equal(calculate(lots).amountCents,70);assert.equal(calculate(lots).distanceMeters,1609.344);
});

test('excludes personal and other-year trips; unclassified current-year travel blocks a complete amount',()=>{
  const personal=trip('personal','2025-03-02',{classification:'personal',distanceMeters:9000,hasGaps:true,endedAt:null});
  const prior=trip('prior','2024-03-01',{hasGaps:true});
  const result=calculate([trip('business'),personal,prior]);assert.equal(result.amountCents,70);assert.equal(result.distanceMeters,1609.344);
  const unclassified=calculate([trip('business'),trip('unclassified','2025-03-02',{classification:'unclassified'})]);
  assert.equal(unclassified.amountCents,null);assert.equal(unclassified.distanceMeters,1609.344);assert.deepEqual(codes(unclassified),['unclassified-trip']);
});

test('blocks missing or impossible local dates without guessing a date from timestamp',()=>{
  for(const [date,code] of [[undefined,'missing-local-date'],['','missing-local-date'],['2025-02-29','invalid-local-date'],['2025-04-31','invalid-local-date']]){
    const result=calculate([trip('bad','2025-03-01',{localDate:date})]);assert.equal(result.amountCents,null);assert.equal(result.distanceMeters,0);assert.ok(codes(result).includes(code));
  }
  assert.equal(calculate([trip('leap','2024-02-29')],2024).amountCents,67);
});

test('gaps, unfinished work, malformed time and bad distance cannot silently enter the deduction',()=>{
  for(const [body,code] of [[{hasGaps:true},'tracking-gaps'],[{hasGaps:undefined},'tracking-gaps'],[{endedAt:null},'unfinished-trip'],[{endedAt:undefined},'unfinished-trip'],[{startedAt:'2025-02-30T10:00:00Z'},'invalid-trip-time'],[{endedAt:'2025-03-01T09:00:00Z'},'invalid-trip-time'],[{distanceMeters:-1},'invalid-distance'],[{distanceMeters:NaN},'invalid-distance'],[{distanceMeters:Infinity},'invalid-distance'],[{distanceMeters:'1609.344'},'invalid-distance']]){
    const result=calculate([trip('bad','2025-03-01',body)]);assert.equal(result.amountCents,null);assert.equal(result.distanceMeters,0);assert.ok(codes(result).includes(code));
  }
});

test('rejects overlapping and duplicate trips while allowing adjacent completed native millisecond trips',()=>{
  const one=trip('one'),two=trip('two','2025-03-01',{startedAt:'2025-03-01T10:30:00Z',endedAt:'2025-03-01T11:30:00Z'});
  const overlapped=calculate([one,two]);assert.equal(overlapped.amountCents,null);assert.equal(overlapped.distanceMeters,0);assert.ok(codes(overlapped).includes('overlapping-trips'));
  const personal=calculate([one,{...two,body:{...two.body,classification:'personal'}}]);assert.equal(personal.amountCents,null);assert.equal(personal.distanceMeters,0);
  const adjacent=[trip('first','2025-03-01',{startedAt:Date.UTC(2025,2,1,10),endedAt:Date.UTC(2025,2,1,11)}),trip('second','2025-03-01',{startedAt:Date.UTC(2025,2,1,11),endedAt:Date.UTC(2025,2,1,12)})];
  assert.equal(calculate(adjacent).amountCents,140);
  assert.ok(codes(calculate([one,structuredClone(one)])).includes('duplicate-trip'));
});

test('detects nested overlap and refuses rate-crossing distance or inconsistent time-zone evidence',()=>{
  const outer=trip('outer','2025-03-01',{startedAt:'2025-03-01T09:00:00Z',endedAt:'2025-03-01T15:00:00Z'}),inner=trip('inner'),later=trip('later','2025-03-01',{startedAt:'2025-03-01T13:00:00Z',endedAt:'2025-03-01T14:00:00Z'});
  assert.equal(calculate([outer,inner,later]).distanceMeters,0);
  const crossing=trip('crossing','2026-06-30',{startedAt:'2026-07-01T03:30:00Z',endedAt:'2026-07-01T04:30:00Z',timeZoneId:'America/New_York'});
  assert.ok(codes(calculate([crossing],2026)).includes('rate-boundary-trip'));
  const mismatch=trip('mismatch','2025-03-01',{timeZoneId:'Pacific/Honolulu',startedAt:'2025-03-01T01:00:00Z',endedAt:'2025-03-01T02:00:00Z'});
  assert.ok(codes(calculate([mismatch])).includes('local-date-time-mismatch'));
  assert.ok(codes(calculate([trip('zone','2025-03-01',{timeZoneId:'Unknown/Zone'})])).includes('invalid-time-zone'));
});

test('does not mutate inputs or expose shared mutable rate data and bounds unsafe output',()=>{
  const records=[trip('business')],before=structuredClone(records),result=calculate(records);
  assert.deepEqual(records,before);result.rates[0].centsPerMile=900;assert.equal(calculate(records).amountCents,70);
  assert.equal(calculate(null).amountCents,null);assert.ok(codes(calculate([null])).includes('invalid-trip'));
  const huge=[trip('huge-one','2025-03-01',{distanceMeters:Number.MAX_SAFE_INTEGER}),trip('huge-two','2025-03-02',{distanceMeters:Number.MAX_SAFE_INTEGER})];
  const overflow=calculate(huge);assert.equal(overflow.amountCents,null);assert.ok(codes(overflow).includes('distance-overflow'));
});
