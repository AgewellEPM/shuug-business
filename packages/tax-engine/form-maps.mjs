// Field suffixes checked against the text/geometry of the pinned 2025 IRS PDFs.
// References are page/field-number, independent of optional XFA read-order groups.
import {energyMap2025} from './energy-form-maps.mjs';
const pairs=(page,entries)=>Object.fromEntries(Object.entries(entries).map(([line,number])=>[line,`${page}/${number}`]));
export const medicareLineMap=Object.freeze(Object.fromEntries(Array.from({length:24},(_,i)=>[String(i+1),`1/${i+3}`])));
export const lineMaps=Object.freeze({
  f5695:energyMap2025,
  f1040s3:{'5a':'1/7','5b':'1/8','8':'1/25'},
  f8959:medicareLineMap,
  f1040:{...pairs(1,{'1a':47,'1z':57,'2b':59,'3b':61,'8':72,'9':73,'10':74,'11a':75}),...pairs(2,{'11b':1,'12e':2,'13a':3,'13b':4,'14':5,'15':6,'16':8,'17':9,'18':10,'19':11,'20':12,'21':13,'22':14,'23':15,'24':16,'25a':17,'25c':19,'25d':20,'26':21,'33':29,'34':30,'35a':31,'37':35})},
  f1040s1:{...pairs(1,{'3':7,'10':38}),...pairs(2,{'15':5,'26':30})},
  f1040s2:{...pairs(1,{'4':15,'11':22}),...pairs(2,{'21':24})},
  f1040sc:pairs(1,{'1':10,'2':11,'3':12,'4':13,'5':14,'6':15,'7':16,'8':17,'9':18,'10':19,'11':20,'14':23,'15':24,'16a':25,'16b':26,'17':27,'18':28,'19':29,'20a':30,'20b':31,'21':32,'22':33,'23':34,'24a':35,'24b':36,'25':37,'26':38,'27b':39,'28':41,'29':42,'30':45,'31':46}),
  f1040sse:pairs(1,{'2':5,'3':6,'4a':7,'4b':8,'4c':9,'5a':10,'5b':11,'6':12,'8a':14,'8b':15,'8c':16,'8d':17,'9':18,'10':19,'11':20,'12':21,'13':22}),
  f8995:pairs(1,{'2':18,'3':19,'4':20,'5':21,'6':22,'7':23,'8':24,'9':25,'10':26,'11':27,'12':28,'13':29,'14':30,'15':31,'16':32,'17':33}),
  f1065:pairs(1,{'1a':19,'1b':20,'1c':21,'2':22,'3':23,'7':27,'8':28,'9':29,'10':30,'11':31,'13':33,'14':34,'15':35,'18':40,'19':41,'21':43,'22':44,'23':45}),
  f1120s:pairs(1,{'1a':17,'1b':18,'1c':19,'2':20,'3':21,'5':23,'6':24,'7':25,'8':26,'9':27,'11':29,'12':30,'13':31,'16':34,'17':35,'18':36,'20':38,'21':39,'22':40}),
  f1120:pairs(1,{'1a':14,'1b':15,'1c':16,'2':17,'3':18,'10':25,'11':26,'12':27,'13':28,'14':29,'16':31,'17':32,'18':33,'22':37,'23':38,'24':39,'26':41,'27':42,'28':43,'29a':44,'29b':45,'29c':46,'30':47,'31':48,'32':49,'33':50,'35':52,'36':53}),
  f1065sk1:pairs(1,{'1':34}),f1120ssk:pairs(1,{'1':21}),
});
export const scheduleMaps=Object.freeze({f1120:{J:pairs(3,{'1a':1,'2':9,'3':10,'4':11,'6':18,'7':19,'10':29,'11a':30,'12':33,'14':35,'19':40,'21':45,'22a':46,'22b':47,'23':48})}});

export function referencedField(form,reference){
  if(reference.startsWith('name:'))return form.getTextField(reference.slice(5));
  const [page,number]=reference.split('/').map(Number),suffix=new RegExp(`\\.f${page}_0*${number}\\[0\\]$`);
  const matches=form.getFields().filter(field=>suffix.test(field.getName()));
  if(matches.length!==1)throw new Error('The pinned official form no longer matches its reviewed field map.');
  return matches[0];
}
