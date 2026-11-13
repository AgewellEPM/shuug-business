#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {verifyCTEitcSources} from '../../packages/tax-engine/test/state-ct-eitc-source-reference.mjs';

const {values}=parseArgs({options:{'source-dir':{type:'string'},out:{type:'string'}},strict:true});
if(!values['source-dir'])throw new Error('Usage: node scripts/tax/verify_ct_eitc_sources.mjs --source-dir DIRECTORY [--out NEW_REPORT.json]');
const report=await verifyCTEitcSources(values['source-dir']);
if(values.out)await writeFile(values.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({sourceCount:report.sourceCount,checksPassed:report.checksPassed,report:values.out??null}));
