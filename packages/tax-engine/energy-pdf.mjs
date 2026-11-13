import {wholeDollars as R,displayMoney} from './money.mjs';
export function energyIdentity(input,item,set){
  const {home,groups,review,clean,sectionA,equipment,partII,codes}=item.energy,year=input.year;
  const name=input.individual.filingStatus==='marriedJoint'?[input.party.name,input.individual.spouseName].filter(Boolean).join(' & '):input.party.name;
  set('1/1',name);set('1/2',input.party.taxId.replaceAll('-',''));
  const address=(page,start)=>['street','unit','city','state','zip'].forEach((key,index)=>set(`${page}/${start+index}`,home[key]));
  const check=(page,n,yes=true)=>set.checkbox(`topmostSubform[0].Page${page}[0].c${page}_${n}[${yes?0:1}]`);
  if(clean&&Object.values(groups).some(items=>items.some(item=>['solar','solarWater','wind','geothermal','battery'].includes(item.category))))address(1,3);
  if(groups.battery.length&&review.battery)check(1,1);
  if(sectionA){address(2,year===2025?3:1);if(review.improvements){for(const n of [1,2,3])check(2,n);check(2,4,false);}}
  if(equipment){address(year===2025?3:2,year===2025?1:15);if(review.property){check(year===2025?3:2,year===2025?1:5);check(year===2025?3:2,year===2025?2:6);}}
  if(groups.audit.length&&review.audit)check(year===2025?4:3,1);
  if(year!==2025)return;
  if(partII){set('2/1',name);set('2/2',input.party.taxId.replaceAll('-',''));}
  const qmid=(item,reference)=>{if(item)set(reference,item.qmid);};
  const cost=(item,reference)=>{if(item)set(reference,String(R(item.costCents)/100),'property-cost');};
  qmid(groups.door[0],'2/11');
  for(const [index,q,c]of [[1,'2/15','2/17'],[2,'2/18','2/20']]){qmid(groups.door[index],q);cost(groups.door[index],c);}
  for(let i=0;i<4;i++){qmid(groups.window[i],`2/${26+i*3}`);cost(groups.window[i],`2/${28+i*3}`);}
  qmid(groups.airConditioner[0],'3/22');qmid(groups.waterHeater[0],'3/28');
  // IRS 2025 has two different fields named f3_30 under different parents.
  cost(groups.waterHeater[0],'name:topmostSubform[0].Page3[0].f3_30[0]');
  qmid(groups.waterHeater[1],'name:topmostSubform[0].Page3[0].Ln23aii[0].Box1-4[0].f3_30[0]');cost(groups.waterHeater[1],'3/32');
  qmid(groups.furnace[0],'3/37');
  if(groups.panel.length&&review.panel)check(3,4);
  codes.forEach((code,index)=>set(`3/${42+index}`,code));
  qmid(groups.panel[0],'3/50');qmid(groups.panel[1],'3/51');
  for(const [key,reference]of [['heatPump','4/6'],['heatPumpWater','4/10'],['biomass','4/14']])qmid(groups[key][0],reference);
}

export function energyWorkpaper(input,line){
  const energy=input.individual?.energyCredits;if(!energy)return;
  line('Form 5695 supporting statement — source costs and manufacturer identifiers',12);
  line('Original entered amounts below retain cents. Printed form rows use whole-dollar rounding. Eligibility and manufacturer records require preparer review.');
  for(const item of energy.items)line(`${item.category}: ${displayMoney(item.costCents)} USD; QMID: ${item.qmid||'not entered'}. ${item.source}`);
  if(input.year===2025&&energy.items.filter(item=>item.category==='panel'&&item.costCents>0).length>2)line('Additional electrical enabling-property QMIDs are listed above with their costs.');
}
