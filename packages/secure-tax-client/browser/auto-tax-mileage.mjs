// Business rates checked against IRS primary sources on 2026-11-17.
// Source record: docs/verification/business-mileage-source-pin-20261117.json.
const RATE_TABLE = Object.freeze([
  {from:'2023-01-01',through:'2023-12-31',centsPerMile:65.5,sourceUrl:'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2023-business-use-increases-3-cents-per-mile'},
  {from:'2024-01-01',through:'2024-12-31',centsPerMile:67,sourceUrl:'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2024-mileage-rate-increases-to-67-cents-a-mile-up-1-point-5-cents-from-2023'},
  {from:'2025-01-01',through:'2025-12-31',centsPerMile:70,sourceUrl:'https://www.irs.gov/newsroom/irs-increases-the-standard-mileage-rate-for-business-use-in-2025-key-rate-increases-3-cents-to-70-cents-per-mile'},
  {from:'2026-01-01',through:'2026-06-30',centsPerMile:72.5,sourceUrl:'https://www.irs.gov/pub/irs-drop/n-26-10.pdf'},
  {from:'2026-07-01',through:'2026-12-31',centsPerMile:76,sourceUrl:'https://www.irs.gov/irb/2026-29_irb'},
].map(Object.freeze));

function validDay(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
}
function instant(value) {
  // Private native Journal timestamps are milliseconds; API/manual records use ISO.
  if(typeof value==='number')return Number.isFinite(value)&&Number.isFinite(new Date(value).getTime())?value:null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)||!validDay(value.slice(0,10)))return null;
  const result=Date.parse(value);return Number.isFinite(result)?result:null;
}
const power=scale=>10n**BigInt(scale);
function decimal(value) {
  // Treat the recorded number's decimal representation exactly, including exponent
  // notation. Never round miles, meters, or individual trips before summing cents.
  const [mantissa,exponent='0']=value.toString().toLowerCase().split('e'),parts=mantissa.split('.');
  const scale=(parts[1]?.length??0)-Number(exponent),units=BigInt(parts.join(''));
  return scale<0?{units:units*power(-scale),scale:0}:{units,scale};
}
function add(total,value,multiplier=1n) {
  if(value.scale>total.scale){total.units*=power(value.scale-total.scale);total.scale=value.scale;}
  total.units+=value.units*power(total.scale-value.scale)*multiplier;
}
function dayAt(formatter,value) {
  const parts=formatter.formatToParts(new Date(value)),part=type=>parts.find(value=>value.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Pure, local calculation over normalized {id,body} trip records. The caller
 * selects current records and explicitly attests standard-mileage eligibility.
 * Every issue blocks amountCents; distanceMeters is only usable business travel.
 * Personal records are ignored. Unknown dates are never inferred from UTC.
 */
export function mileageDeduction(trips,year,{eligible=false}={}) {
  const rates=Number.isInteger(year)?RATE_TABLE.filter(rate=>rate.from.startsWith(`${year}-`)).map(rate=>({...rate})):[];
  const issues=[],codes=new Set(),issue=(code,message)=>{if(!codes.has(code)){codes.add(code);issues.push({code,message});}};
  if(eligible!==true)issue('eligibility-required','Confirm that you qualify for the standard mileage method before using a mileage deduction.');
  if(!rates.length)issue('unsupported-year','Verified business mileage rates are available only for 2023–2026.');
  if(!Array.isArray(trips)){issue('invalid-trips','The trip records could not be read.');return {amountCents:null,distanceMeters:0,issues,rates};}
  const candidates=[],intervals=[],ids=new Map(),formatters=new Map();
  for(const record of trips)if(typeof record?.id==='string')ids.set(record.id,(ids.get(record.id)??0)+1);
  for(const record of trips) {
    if(record?.deleted===true)continue;
    const body=record?.body;
    if(!body||typeof body!=='object'||Array.isArray(body)){issue('invalid-trip','Review a trip whose recorded details could not be read.');continue;}
    const start=instant(body.startedAt),end=instant(body.endedAt);
    const interval=start!==null&&end!==null&&end>start?{start,end,candidate:null}:null;
    if(interval)intervals.push(interval);
    if(body.classification==='personal')continue;
    if(body.localDate===undefined||body.localDate===null||body.localDate==='') {issue('missing-local-date','Add the recorded local date to trips that have no date before calculating mileage.');continue;}
    if(!validDay(body.localDate)){issue('invalid-local-date','Correct an invalid recorded local trip date before calculating mileage.');continue;}
    if(Number(body.localDate.slice(0,4))!==year)continue;
    if(body.classification==='unclassified'){issue('unclassified-trip','Classify the unclassified trips for this year; they are excluded from business mileage.');continue;}
    if(body.classification!=='business'){issue('invalid-classification','Choose a business or personal classification for trips in this year.');continue;}
    let valid=true;
    if(typeof record.id!=='string'||!record.id.trim()){issue('invalid-trip','Review a trip whose recorded details could not be read.');valid=false;}
    else if(ids.get(record.id)>1){issue('duplicate-trip','Resolve duplicate trip records before using a mileage deduction.');valid=false;}
    if(typeof body.distanceMeters!=='number'||!Number.isFinite(body.distanceMeters)||body.distanceMeters<0||body.distanceMeters>Number.MAX_SAFE_INTEGER){issue('invalid-distance','Correct missing or invalid business-trip distances before calculating mileage.');valid=false;}
    if(body.hasGaps!==false){issue('tracking-gaps','Review business trips with gaps or unconfirmed tracking before calculating mileage.');valid=false;}
    if(body.endedAt===null||body.endedAt===undefined||body.endedAt===''){issue('unfinished-trip','Finish the business trips that are still in progress before calculating mileage.');valid=false;}
    else if(start===null||end===null||end<start||(end===start&&body.distanceMeters>0)){issue('invalid-trip-time','Correct invalid business-trip start and end times before calculating mileage.');valid=false;}
    if(start===null){issue('invalid-trip-time','Correct invalid business-trip start and end times before calculating mileage.');valid=false;}
    const rate=rates.find(rate=>body.localDate>=rate.from&&body.localDate<=rate.through);
    if(!rate&&rates.length){issue('rate-unavailable','No verified business mileage rate covers a recorded trip date.');valid=false;}
    if(body.timeZoneId!==undefined&&start!==null&&end!==null) {
      try {
        if(typeof body.timeZoneId!=='string'||!body.timeZoneId||body.timeZoneId.length>100)throw new Error('Invalid time zone');
        let formatter=formatters.get(body.timeZoneId);
        if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:body.timeZoneId,year:'numeric',month:'2-digit',day:'2-digit'});formatters.set(body.timeZoneId,formatter);}
        const localStart=dayAt(formatter,start),localEnd=dayAt(formatter,end>start?Math.max(start,end-1):end);
        if(localStart!==body.localDate){issue('local-date-time-mismatch','Review a business trip whose recorded date differs from its recorded time zone.');valid=false;}
        if(rate&&(localEnd<rate.from||localEnd>rate.through)){issue('rate-boundary-trip','Split business-trip distance at a tax-year or mileage-rate change before using it.');valid=false;}
      } catch {issue('invalid-time-zone','Correct an invalid recorded business-trip time zone before calculating mileage.');valid=false;}
    }
    if(valid){const candidate={distance:decimal(body.distanceMeters),rate,overlap:false};candidates.push(candidate);if(interval)interval.candidate=candidate;}
  }
  // Sweep all complete intervals, including personal travel, so a business trip
  // cannot be counted while another recorded trip covers the same time.
  intervals.sort((a,b)=>a.start-b.start||a.end-b.end);
  let longest=null;
  for(const interval of intervals){
    if(longest&&interval.start<longest.end&&(interval.candidate||longest.candidate)){
      if(interval.candidate)interval.candidate.overlap=true;
      if(longest.candidate)longest.candidate.overlap=true;
      issue('overlapping-trips','Resolve overlapping business-trip times before using a mileage deduction.');
    }
    if(!longest||interval.end>longest.end)longest=interval;
  }
  const distance={units:0n,scale:0},weighted={units:0n,scale:0};
  for(const candidate of candidates)if(!candidate.overlap){add(distance,candidate.distance);if(candidate.rate)add(weighted,candidate.distance,BigInt(candidate.rate.centsPerMile*2));}
  const distanceMeters=Number(`${distance.units}e-${distance.scale}`);
  if(!Number.isFinite(distanceMeters)||distanceMeters>Number.MAX_SAFE_INTEGER)issue('distance-overflow','The recorded business distance is too large to calculate safely.');
  // 1 international mile = 1,609.344 meters exactly. Rates use half-cent units.
  const numerator=weighted.units*500n,denominator=1609344n*power(weighted.scale);
  const rounded=(numerator+denominator/2n)/denominator;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))issue('amount-overflow','The mileage deduction is too large to calculate safely.');
  return {amountCents:issues.length?null:Number(rounded),distanceMeters:Number.isFinite(distanceMeters)?distanceMeters:0,issues,rates};
}
