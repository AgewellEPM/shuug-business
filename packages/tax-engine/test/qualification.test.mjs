import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {qualificationReport} from '../../../scripts/tax/qualification-report.mjs';

test('passing published examples and pinned local blanks never become agency or full-scenario approval',async()=>{
  const report=await qualificationReport();assert.equal(report.internalChecksPassed,true);
  assert.deepEqual(report.requestedYears,[2023,2024,2025,2026,2027]);assert.deepEqual(report.partialCalculationYears,[2026,2027]);assert.deepEqual(report.installedPacks.find(pack=>pack.year===2027).forms,[]);assert.equal(report.federal2027Availability.annualRulesAvailable,true);assert.equal(report.agencyApproval,false);assert.equal(report.releaseReady,false);assert.equal(report.agencySubmissionAttempted,false);
  assert(report.scenarios.every(scenario=>scenario.fullScenarioExecuted===false&&scenario.sourceBytesVerified===false&&scenario.status==='blocked'));
  assert(report.installedPacks.every(pack=>pack.forms.every(form=>form.filingApproved===false)));
  assert.equal(report.householdFutaDerivedChecks.length,13);assert.equal(report.investmentDerivedChecks.length,24);
  assert.equal(report.capitalPublishedChecks.length,15);assert.equal(report.capitalDerivedChecks.length,27);assert(report.capitalPublishedChecks.every(check=>check.pass));assert(report.capitalDerivedChecks.every(check=>check.pass&&check.kind==='derived-synthetic-instruction-vector'));assert.equal(report.capitalPublishedChecks.filter(check=>check.kind==='published-arithmetic-synthetic-adjustment').length,3);
  assert.equal(report.retirementPublishedChecks.length,3);assert.equal(report.retirementDerivedChecks.length,45);assert(report.retirementPublishedChecks.every(check=>check.pass&&check.kind==='published-instruction-example'));assert(report.retirementDerivedChecks.every(check=>check.pass&&check.kind==='derived-synthetic-instruction-vector'));assert.equal(report.sourceEvidence.length,0);
  assert.equal(report.standardPublishedChecks.length,21);assert.equal(report.standardDerivedChecks.length,8);assert.equal(report.ctPublishedChecks.length,3);assert.equal(report.ctDerivedChecks.length,24);assert([...report.standardPublishedChecks,...report.ctPublishedChecks].every(check=>check.pass&&check.kind==='published-instruction-example'));assert([...report.standardDerivedChecks,...report.ctDerivedChecks].every(check=>check.pass&&check.kind==='derived-synthetic-instruction-vector'));
  assert.equal(report.schedule1APublishedChecks.length,4);assert.equal(report.schedule1ADerivedChecks.length,7);assert(report.schedule1APublishedChecks.every(check=>check.pass&&check.kind==='published-arithmetic-synthetic-eligibility'));assert(report.schedule1ADerivedChecks.every(check=>check.pass&&check.kind==='derived-synthetic-instruction-vector'));
  assert([...report.householdFutaDerivedChecks,...report.investmentDerivedChecks].every(check=>check.pass&&check.kind==='derived-synthetic-instruction-vector'));
  assert(report.installedPacks.filter(pack=>pack.year<=2025).every(pack=>['f1040sb','f8960','f1040sd','f8949'].every(id=>pack.forms.some(form=>form.id===id))));assert.equal(report.readiness,'prototype');
});
test('selected official scenario bytes must match the reviewed pin before claiming source verification',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'shuug-qualification-'));
  try{
    const catalog=JSON.parse(await readFile(new URL('../qualification/ats-scenarios.json',import.meta.url),'utf8'));
    await writeFile(path.join(directory,catalog.selectedScenarios[0].sourceFile),'changed source bytes');
    await assert.rejects(()=>qualificationReport({sourcesDirectory:directory}),/Source bytes differ from the reviewed pin/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
