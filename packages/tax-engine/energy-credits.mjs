import {strictObject,list,text,amountFields,diagnostic} from './model.mjs';
import {checkedMoney,wholeDollars as R,wholeRatio as P,sumMoney} from './money.mjs';

export const energyCategories=Object.freeze([
  ['solar','Solar electric'],['solarWater','Solar water heating'],['wind','Small wind'],['geothermal','Geothermal heat pump'],['battery','Battery storage (at least 3 kWh)'],
  ['insulation','Insulation / air sealing (materials only)'],['door','Exterior door (materials only)'],['window','Window / skylight (materials only)'],
  ['airConditioner','Central air conditioner'],['waterHeater','Gas / propane / oil water heater'],['furnace','Gas / propane / oil furnace or hot-water boiler'],
  ['panel','Electrical enabling property'],['audit','Qualified home energy audit'],['heatPump','Electric / gas heat pump'],['heatPumpWater','Heat-pump water heater'],['biomass','Biomass stove / boiler'],
].map(Object.freeze));
export const energyReviews=Object.freeze([
  ['scope','One home only; no fuel cells, separate-return joint occupants, or condominium/cooperative fractional allocation'],
  ['costs','Eligible costs and product standards verified for this tax year; rebates/subsidies and business-use exclusions applied; supporting records retained'],
  ['clean','Clean-energy property installed at a qualifying US residence; solar-water, wind and geothermal requirements verified'],
  ['battery','Battery capacity is at least 3 kWh'],
  ['improvements','Section A improvements: owned US main home, original use, expected use at least 5 years; no new-construction costs'],
  ['property','Section B equipment: US residence, original placement in service and annual efficiency standards verified'],
  ['panel','Panel: NEC compliant, at least 200 amps, installed with the selected qualifying property; installation-year requirements verified'],
  ['audit','Main-home inspection and written report by a qualified/certified energy auditor verified for this year'],
  ['carryforward','Prior-year Form 5695 line 16 carryforward verified'],
].map(Object.freeze));
export const newEnergyCredits=()=>({home:{street:'',unit:'',city:'',state:'',zip:''},items:[],carryforwardCents:0,panelEnabledTypes:[],review:Object.fromEntries(energyReviews.map(([key])=>[key,false]))});
const cleanTypes=['solar','solarWater','wind','geothermal','battery'],improvementTypes=['insulation','door','window'],equipmentTypes=['airConditioner','waterHeater','furnace','panel','heatPump','heatPumpWater','biomass'];
export const panelEnabledTypes=Object.freeze([['A','Windows / skylights'],['B','Central air conditioner'],['C','Gas / propane / oil water heater'],['D','Furnace / boiler'],['E','Heat pump'],['F','Heat-pump water heater'],['G','Biomass stove / boiler']].map(Object.freeze));

// One qualifying residence, ordinary liability and no other credit worksheets.
// Unsupported arrangements retain input and suppress allowed credits/totals.
export function energyCredits(value,{year,taxBeforeCreditsCents,otherTreatments=false,cleanCreditReserveCents=0}){
  const empty={required:false,creditCents:0,cleanCreditCents:0,improvementCreditCents:0,carryforwardCents:0,form:null,diagnostics:[]};
  if(value===undefined)return empty;
  strictObject(value,['home','items','carryforwardCents','panelEnabledTypes','review'],'Residential energy credits');amountFields(value,['carryforwardCents'],'Energy carryforward');
  strictObject(value.home,['street','unit','city','state','zip'],'Energy property address');for(const key of ['street','unit','city','state','zip'])text(value.home[key],`Energy home ${key}`);
  strictObject(value.review,energyReviews.map(([key])=>key),'Energy eligibility review');for(const [key]of energyReviews)if(typeof value.review[key]!=='boolean')throw new Error('Energy eligibility reviews must be explicit yes/no decisions.');
  const codes=list(value.panelEnabledTypes,'Enabled property types',7);if(new Set(codes).size!==codes.length||codes.some(code=>!panelEnabledTypes.some(([key])=>key===code)))throw new Error('Choose each supported enabled-property code at most once.');
  const ids=new Set(),items=list(value.items,'Energy property items',100);
  for(const item of items){strictObject(item,['id','category','costCents','qmid','source'],'Energy item');text(item.id,'Energy item identifier',100);text(item.qmid,'Manufacturer identifier',4);text(item.source,'Energy source reference',500);amountFields(item,['costCents'],'Eligible energy cost');if(!item.id||ids.has(item.id)||!energyCategories.some(([key])=>key===item.category))throw new Error('Each energy item needs a unique identifier and supported category.');ids.add(item.id);}
  const groups=Object.fromEntries(energyCategories.map(([key])=>[key,items.filter(item=>item.category===key&&item.costCents>0).sort((a,b)=>b.costCents-a.costCents||(a.id<b.id?-1:1))]));
  const has=types=>types.some(key=>groups[key].length),clean=has(cleanTypes)||value.carryforwardCents>0,sectionA=has(improvementTypes),equipment=has(equipmentTypes),partII=sectionA||equipment||groups.audit.length>0;
  if(!clean&&!partII)return empty;
  if(year>=2026)return {...empty,required:true,creditCents:null,cleanCreditCents:null,improvementCreditCents:null,carryforwardCents:null,diagnostics:[diagnostic(`ENERGY_${year}_REVIEW_REQUIRED`,`New home-energy expenditures after 2025 do not use the prior-year credit rules. A reviewed ${year} carryforward/form calculation is not installed; retained costs and carryforwards require separate review.`)]};
  if(cleanCreditReserveCents!==null)checkedMoney(cleanCreditReserveCents,'Child/dependent credit reserved before clean energy');
  const diagnostics=[],need=(test,code,message)=>{if(!test)diagnostics.push(diagnostic(code,message));};
  need(value.review.scope,'ENERGY_SCOPE_REVIEW','Confirm the supported single-home ownership scope. Fuel cells, separate-return joint occupants and fractional condominium/cooperative credits require additional treatment.');
  if(items.some(item=>item.costCents)){
    need(value.review.costs,'ENERGY_COST_REVIEW','Review eligible installed-year costs, annual product standards, labor eligibility, rebates/subsidies and business use before claiming energy credits.');
    need(['street','city','state','zip'].every(key=>value.home[key].trim())&&/^[A-Z]{2}$/.test(value.home.state)&&/^\d{5}(?:-\d{4})?$/.test(value.home.zip),'ENERGY_ADDRESS_REQUIRED','Enter the complete US property address for Form 5695.');
  }
  for(const [key,active]of [['clean',has(cleanTypes)],['battery',groups.battery.length],['improvements',sectionA],['property',equipment],['audit',groups.audit.length],['panel',groups.panel.length],['carryforward',value.carryforwardCents]])if(active)need(value.review[key],'ENERGY_'+key.toUpperCase()+'_REVIEW',energyReviews.find(([id])=>id===key)[1]+'.');
  if(year===2025)for(const item of items.filter(item=>item.costCents&&['door','window',...equipmentTypes].includes(item.category)))need(/^[A-Z0-9]{4}$/.test(item.qmid),'ENERGY_QMID_REQUIRED','Every specified 2025 item needs its four-character manufacturer QMID, checked against the retained manufacturer record. Format alone is not verification.');
  if(groups.panel.length)need(codes.length>0,'ENERGY_ENABLED_PROPERTY_REQUIRED','Select the qualifying property enabled by the electrical work, including any reviewed prior-year installation.');
  need(!otherTreatments&&taxBeforeCreditsCents!==null,'ENERGY_TAX_LIMIT_UNKNOWN','Complete other tax treatments and credit-limit worksheets before calculating allowed energy credits.');
  const unknown=diagnostics.length>0,total=key=>R(sumMoney(groups[key].map(item=>item.costCents))),shownTotal=items=>sumMoney(items.map(item=>R(item.costCents))),lines={};
  const thirty=(value,cap=Infinity)=>Math.min(P(value,3000),cap),allowed=value=>unknown?null:value;
  let improvements=0,cleanAvailable=0;
  if(partII){
    lines['18a']=total('insulation');lines['18b']=thirty(lines['18a'],120000);
    const doors=groups.door,first=R(doors[0]?.costCents??0),rest=R(sumMoney(doors.slice(1).map(item=>item.costCents)));
    if(year===2025){Object.assign(lines,{'19a':first,'19c':thirty(first,25000),'19d':shownTotal(doors.slice(1,3)),'19e':R(sumMoney(doors.slice(3).map(item=>item.costCents)))});lines['19f']=sumMoney([lines['19d'],lines['19e']]);lines['19g']=thirty(lines['19f']);lines['19h']=Math.min(50000,sumMoney([lines['19c'],lines['19g']]));
      lines['20a']=shownTotal(groups.window.slice(0,4));lines['20b']=R(sumMoney(groups.window.slice(4).map(item=>item.costCents)));lines['20c']=sumMoney([lines['20a'],lines['20b']]);lines['20d']=thirty(lines['20c'],60000);
    }else{Object.assign(lines,{'19a':first,'19b':thirty(first,25000),'19c':rest,'19d':thirty(rest),'19e':Math.min(50000,sumMoney([thirty(first,25000),thirty(rest)])),'20a':total('window')});lines['20b']=thirty(lines['20a'],60000);}
    for(const [key,line,shown]of [['airConditioner','22',1],['waterHeater','23',2],['furnace','24',1]]){
      if(year===2025){lines[line+'a']=shownTotal(groups[key].slice(0,shown));lines[line+'b']=R(sumMoney(groups[key].slice(shown).map(item=>item.costCents)));lines[line+'c']=sumMoney([lines[line+'a'],lines[line+'b']]);lines[line+'d']=thirty(lines[line+'c'],60000);}
      else{lines[line+'a']=total(key);lines[line+'b']=thirty(lines[line+'a'],60000);}
    }
    lines[year===2025?'25c':'25a']=total('panel');lines[year===2025?'25e':'25b']=thirty(total('panel'),60000);lines['26b']=total('audit');lines['26c']=thirty(lines['26b'],15000);
    lines['27']=sumMoney((year===2025?['18b','19h','20d','22d','23d','24d','25e','26c']:['18b','19e','20b','22b','23b','24b','25b','26c']).map(key=>lines[key]));lines['28']=Math.min(120000,lines['27']);
    if(year===2025){for(const [key,line]of [['heatPump','a'],['heatPumpWater','c'],['biomass','e']]){lines['29'+line]=R(groups[key][0]?.costCents??0);lines['29'+String.fromCharCode(line.charCodeAt(0)+1)]=R(sumMoney(groups[key].slice(1).map(item=>item.costCents)));}lines['29g']=sumMoney(['a','b','c','d','e','f'].map(line=>lines['29'+line]));lines['29h']=thirty(lines['29g'],200000);}
    else{Object.assign(lines,{'29a':total('heatPump'),'29b':total('heatPumpWater'),'29c':total('biomass')});lines['29d']=sumMoney(['a','b','c'].map(line=>lines['29'+line]));lines['29e']=thirty(lines['29d'],200000);}
    lines['30']=sumMoney([lines['28'],lines[year===2025?'29h':'29e']]);lines['31']=allowed(taxBeforeCreditsCents);improvements=unknown?null:Math.min(lines['30'],lines['31']);lines['32']=improvements;
  }
  let cleanCredit=0,carryforward=0;
  if(clean){
    for(const [key,line]of [['solar','1'],['solarWater','2'],['wind','3'],['geothermal','4'],['battery','5b']])lines[line]=total(key);
    lines['6a']=sumMoney(['1','2','3','4','5b'].map(key=>lines[key]));lines['6b']=thirty(lines['6a']);lines['12']=R(value.carryforwardCents);lines['13']=sumMoney([lines['6b'],lines['12']]);cleanAvailable=lines['13'];
    // Part II has priority in the IRS line-14 worksheet; only clean energy carries.
    lines['14']=unknown||cleanCreditReserveCents===null?null:Math.max(0,taxBeforeCreditsCents-improvements-cleanCreditReserveCents);cleanCredit=lines['14']===null?null:Math.min(lines['13'],lines['14']);lines['15']=cleanCredit;carryforward=cleanCredit===null?null:lines['13']-cleanCredit;if(cleanCreditReserveCents===null)diagnostics.push(diagnostic('ENERGY_CHILD_CREDIT_LIMIT_UNRESOLVED','Resolve the child/other-dependent credit limitation reserved before the residential clean-energy credit. Improvement credits retain their separate priority.'));lines['16']=carryforward;
  }
  if(unknown)for(const key of ['18b','19b','19c','19d','19e','19g','19h','20b','20d','22b','22d','23b','23d','24b','24d','25b','25e','26c','27','28','29e','29h','30','6b']){
    // Only credit/total lines, never source-cost lines, become unavailable.
    const credits=year===2025?['18b','19c','19g','19h','20d','22d','23d','24d','25e','26c','27','28','29h','30','6b']:['18b','19b','19d','19e','20b','22b','23b','24b','25b','26c','27','28','29e','30','6b'];if(credits.includes(key)&&Object.hasOwn(lines,key))lines[key]=null;
  }
  if(unknown&&clean)lines['13']=null;
  return {required:true,creditCents:unknown||cleanCredit===null||improvements===null?null:sumMoney([cleanCredit,improvements]),cleanCreditCents:clean?cleanCredit:0,improvementCreditCents:partII?improvements:0,carryforwardCents:carryforward,cleanAvailableCents:cleanAvailable,diagnostics,
    form:{form:'f5695',copyId:'residential-energy',lines,energy:{home:value.home,review:value.review,groups,codes,clean,sectionA,equipment,partII,unknown}}};
}
