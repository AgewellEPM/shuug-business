import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {qualificationReport} from '../../../scripts/tax/qualification-report.mjs';

test('passing published examples and pinned local blanks never become agency or full-scenario approval',async()=>{
  const report=await qualificationReport();assert.equal(report.internalChecksPassed,true);
  assert.equal(report.agencyApproval,false);assert.equal(report.releaseReady,false);assert.equal(report.agencySubmissionAttempted,false);
  assert(report.scenarios.every(scenario=>scenario.fullScenarioExecuted===false&&scenario.sourceBytesVerified===false&&scenario.status==='blocked'));
  assert(report.installedPacks.every(pack=>pack.forms.every(form=>form.filingApproved===false)));
});
test('selected official scenario bytes must match the reviewed pin before claiming source verification',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'shuug-qualification-'));
  try{
    const catalog=JSON.parse(await readFile(new URL('../qualification/ats-scenarios.json',import.meta.url),'utf8'));
    await writeFile(path.join(directory,catalog.selectedScenarios[0].sourceFile),'changed source bytes');
    await assert.rejects(()=>qualificationReport({sourcesDirectory:directory}),/Source bytes differ from the reviewed pin/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
