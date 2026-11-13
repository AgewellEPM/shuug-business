// Checked against final2026 ScheduleC/SE text, field names and geometry.
// ScheduleC adds separate city/state/ZIP and a vehicle-interest line16b.
const page1=values=>Object.freeze(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,`1/${value}`])));
export const lineMaps2026=Object.freeze({
  f1040sc:page1({'1':13,'2':14,'3':15,'4':16,'5':17,'6':18,'7':19,'8':20,'9':21,'10':22,'11':23,'14':26,'15':27,'16a':28,'16b':29,'16c':31,'17':32,'18':33,'19':34,'20a':35,'20b':36,'21':37,'22':38,'23':39,'24a':40,'24b':41,'25':42,'26':43,'27b':45,'28':46,'29':47,'30':50,'31':51}),
  f1040sse:page1({'2':5,'3':6,'4a':7,'4b':8,'4c':9,'5a':10,'5b':11,'6':12,'8a':14,'8b':15,'8c':16,'8d':17,'9':18,'10':19,'11':20,'12':21,'13':22}),
});
export const scheduleMaps2026=Object.freeze({});
export function identity2026(input,item,set){
  if(!['f1040sc','f1040sse'].includes(item.form))return false;
  const party=input.party,person=item.owner==='spouse'?{name:input.individual.spouseName,taxId:input.individual.spouseTaxId}:party;
  set('1/1',person.name);set('1/2',person.taxId.replaceAll('-',''));
  if(item.form==='f1040sc'){
    const business=input.individual.businesses.find(value=>value.id===item.copyId);
    set('1/3',business.name);set('1/4',business.businessCode);set('1/5',business.name);set('1/6',business.ein.replaceAll('-',''));
    set('1/7',party.street);set('1/9',party.city);set('1/10',party.state);set('1/11',party.zip);
    set.checkbox(`topmostSubform[0].Page1[0].c1_2[${business.materialParticipation?0:1}]`);
  }
  return true;
}
