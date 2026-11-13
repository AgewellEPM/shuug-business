// Inventory original IRS blanks without rewriting their bytes. The resulting
// metadata is evidence for map review, not automatic approval of field meanings.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const {PDFDocument}=createRequire(new URL('../../packages/tax-engine/package.json',import.meta.url))('pdf-lib');
const [yearText,manifestFile,directory]=process.argv.slice(2),year=Number(yearText);
if(![2023,2024,2025].includes(year)||!manifestFile||!directory)throw new Error('Use YEAR DOWNLOADED_MANIFEST_JSON FORMS_DIRECTORY for a reviewed annual source.');
const inputs=JSON.parse(await readFile(manifestFile,'utf8')),forms=[];
const required=['f1040','f1040s1','f1040s2','f1040s3','f1040sc','f1040sse','f1065','f1065sk1','f1120','f1120s','f1120ssk','f5695','f8959','f8995'];
if(!Array.isArray(inputs)||inputs.length!==required.length||inputs.map(value=>value.id).sort().join('|')!==required.sort().join('|'))throw new Error('Expected the complete declared source pack.');
for(const input of inputs){
  if(!/^f[0-9a-z]+$/.test(input.id)||input.taxYear!==year||input.url!==`https://www.irs.gov/pub/irs-prior/${input.id}--${year}.pdf`)throw new Error('Unexpected IRS source binding.');
  const bytes=await readFile(path.join(directory,input.id+'.pdf'));
  if(bytes.length!==input.bytes||createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('The downloaded original changed.');
  const pdf=await PDFDocument.load(bytes),fields=pdf.getForm().getFields().map(field=>({name:field.getName(),type:field.constructor.name,rect:field.acroField.getWidgets()[0].getRectangle()}));
  forms.push({...input,pages:pdf.getPageCount(),fieldCount:fields.length});
  await writeFile(path.join(directory,input.id+'.fields.json'),'[\n  '+fields.map(value=>JSON.stringify(value)).join(',\n  ')+'\n]\n',{flag:'wx'});
}
await writeFile(path.join(directory,'manifest.json'),JSON.stringify({taxYear:year,source:'Original public IRS prior-year PDFs',fieldMapsReviewed:false,forms},null,2)+'\n',{flag:'wx'});
await writeFile(path.join(directory,'templates.mjs'),`// Pinned original IRS ${year} blanks; see manifest.json for provenance.\nexport const officialForms${year}=Object.freeze(`+JSON.stringify(forms,null,2)+'.map(Object.freeze));\n',{flag:'wx'});
console.log(JSON.stringify({year,forms:forms.length,fieldMapsReviewed:false}));
