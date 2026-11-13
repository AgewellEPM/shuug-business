// Reproducible local evidence and explicit gaps. Never issues an approval,
// changes filingReady, contacts an agency or includes customer information.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {additionalMedicare} from '../../packages/tax-engine/additional-medicare.mjs';
import {energyCredits,newEnergyCredits} from '../../packages/tax-engine/energy-credits.mjs';
import {calculationYears,requestedTaxYears} from '../../packages/tax-engine/index.mjs';
import {pdfYearPack} from '../../packages/tax-engine/form-years.mjs';

const engine=fileURLToPath(new URL('../../packages/tax-engine/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function checkedSource(file,expected){
  const bytes=await readFile(file);
  if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw new Error(`Source bytes differ from the reviewed pin: ${path.basename(file)}`);
  return {sha256:expected.sha256,bytes:bytes.length};
}
export async function qualificationReport({sourcesDirectory=null}={}){
  const catalog=JSON.parse(await readFile(path.join(engine,'qualification/ats-scenarios.json'),'utf8'));
  const examples=JSON.parse(await readFile(path.join(engine,'test/irs-8959-examples.json'),'utf8'));
  const energyExamples=JSON.parse(await readFile(path.join(engine,'test/irs-energy-examples.json'),'utf8'));
  const sourceEvidence=[];
  if(sourcesDirectory){
    for(const scenario of catalog.selectedScenarios)sourceEvidence.push({id:scenario.id,...await checkedSource(path.join(sourcesDirectory,scenario.sourceFile),scenario)});
    sourceEvidence.push({id:'8959-instructions',...await checkedSource(path.join(sourcesDirectory,'i8959--2025.pdf'),examples.source)});
    sourceEvidence.push({id:'energy-faq-examples',...await checkedSource(path.join(sourcesDirectory,'irs-energy-examples.html'),energyExamples.source)});
  }
  const instructionChecks=examples.examples.map(example=>{
    const result=additionalMedicare({filingStatus:example.filingStatus,w2s:example.medicareWagesDollars.map(wages=>({medicareWagesCents:wages*100,medicareTaxWithheldCents:wages*1.45})),selfEmploymentEarnings:example.selfEmploymentIncomeDollars.map(value=>value*100)});
    const actual={required:result.required,taxCents:result.taxCents,wageSubjectCents:result.form?.lines['6']??0,selfEmploymentSubjectCents:result.form?.lines['12']??0};
    const expected={required:example.required,taxCents:example.expectedAdditionalTaxDollars*100,wageSubjectCents:example.expectedWageSubjectDollars*100,selfEmploymentSubjectCents:example.expectedSelfEmploymentSubjectDollars*100};
    return {id:example.id,pass:JSON.stringify(actual)===JSON.stringify(expected),actual,expected};
  });
  const energyInstructionChecks=calculationYears.flatMap(year=>energyExamples.examples.map(example=>{
    const value=newEnergyCredits();Object.assign(value.home,{street:'1 Example Street',city:'Hartford',state:'CT',zip:'06103'});for(const key of Object.keys(value.review))value.review[key]=true;
    value.items=example.costs.map(([category,dollars],index)=>({id:'synthetic-'+index,category,costCents:dollars*100,qmid:'A1B2',source:'Synthetic eligibility record for arithmetic verification'}));
    const result=energyCredits(value,{year,taxBeforeCreditsCents:1000000});return {year,id:example.id,pass:result.creditCents===example.expectedCreditDollars*100&&result.diagnostics.length===0,actualCreditCents:result.creditCents,expectedCreditCents:example.expectedCreditDollars*100};
  }));
  const installedPacks=[];
  for(const year of calculationYears){
    const pack=pdfYearPack(year),forms=[];
    for(const form of pack.templates){
      const bytes=await checkedSource(path.join(engine,`forms/${year}/${form.id}.pdf`),form);
      forms.push({id:form.id,...bytes,mappedLines:Object.keys(pack.lineMaps[form.id]??{}).length,coverage:'partial',filingApproved:false});
    }
    installedPacks.push({year,forms});
  }
  const scenarios=catalog.selectedScenarios.map(scenario=>{
    const installed=installedPacks.find(pack=>pack.year===scenario.taxYear)?.forms??[];
    return {id:scenario.id,source:scenario.url,sourceSha256:scenario.sha256,sourceBytesVerified:sourceEvidence.some(item=>item.id===scenario.id),status:'blocked',fullScenarioExecuted:false,
      requirements:scenario.requiredForms.map(id=>({id,status:installed.some(form=>form.id===id)?'partial-calculation-and-draft-pdf':id==='w2'?'partial-source-input-no-mef-xml':'not-implemented'})),
      missingBoundary:'Complete required forms/disclosures/attachments, scenario import and expected-output checks, official XML validation, transport and agency acceptance.'};
  });
  const sourceFiles=[];
  async function inventory(relative=''){
    for(const entry of await readdir(path.join(engine,relative),{withFileTypes:true})){
      if(['node_modules','dist'].includes(entry.name))continue;
      const name=path.posix.join(relative,entry.name);
      if(entry.isDirectory())await inventory(name);
      else if(entry.isFile())sourceFiles.push({path:name,sha256:hash(await readFile(path.join(engine,name)))});
      else throw new Error('Unexpected non-file in the tax-engine source inventory.');
    }
  }
  await inventory();sourceFiles.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return {version:1,type:'shuug-local-qualification-evidence',createdAt:new Date().toISOString(),readiness:'prototype',sourceInventorySha256:hash(JSON.stringify(sourceFiles)),sourceFiles,
    internalChecksPassed:[...instructionChecks,...energyInstructionChecks].every(item=>item.pass),instructionChecks,energyInstructionChecks,sourceEvidence,installedPacks,scenarios,
    requestedYears:requestedTaxYears,unimplementedCalculationYears:requestedTaxYears.filter(year=>!calculationYears.includes(year)),stateCalculationPacks:[],
    agencySubmissionAttempted:false,agencyApproval:false,releaseReady:false,externalSteps:catalog.requiredExternalSteps,references:catalog.references,
    limits:['Instruction examples are not ATS scenario execution.','Pinned blank forms and mapped rows do not establish complete form coverage.','Selected scenarios do not determine the full required IRS test plan.','No real customer, physical custody, installed service or independent review is exercised.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const options={},args=process.argv.slice(2);
    for(let i=0;i<args.length;i+=2){if(!['--sources','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,args[i]))throw new Error('Usage: node scripts/tax/qualification-report.mjs [--sources REVIEWED_PDFS_DIRECTORY] [--out NEW_REPORT_JSON]');options[args[i]]=path.resolve(args[i+1]);}
    const report=await qualificationReport({sourcesDirectory:options['--sources']}),text=JSON.stringify(report,null,2)+'\n';
    if(options['--out'])await writeFile(options['--out'],text,{flag:'wx',mode:0o600});else process.stdout.write(text);
    // Successful local execution is deliberately distinct from release readiness.
    if(!report.internalChecksPassed)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
