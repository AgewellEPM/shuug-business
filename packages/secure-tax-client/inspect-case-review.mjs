#!/usr/bin/env node
// Trusted operator preparation only: no approval, key unlock, network or UI launch.
import {mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decode64} from './envelope.mjs';
import {selectedJson} from './return-edit-review.mjs';
import {readReviewedCaseKit} from './case-review.mjs';
import {replayCaseBooks,caseBookReport} from './case-books.mjs';
const warning='Candidate private review copies. Review the case fields, command and actual selected file. This inspector cannot establish that readable evidence matches the encrypted proposal; final firm approval reconstructs that correspondence. After review, approve only the copied private-kit.json using the exact hash in kit-sha256.txt.';
export async function inspectCaseReview({pinsFile,kitFile,output}){
  const pins=(await selectedJson(pinsFile,4096)).value,{bytes}=await selectedJson(kitFile,64*1024*1024);let owned=false,evidenceBytes;
  try{
    const kitSha256=createHash('sha256').update(bytes).digest('hex'),{kit}=await readReviewedCaseKit(kitFile,kitSha256,pins),review=kit.privateReview,evidence=review.evidence;let selectedFile=null,summary=null;
    if(evidence!==null){
      const payload=evidence.payload;
      if(payload.type==='private-file'){
        const suffix={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','text/csv':'csv'}[payload.mime];if(!suffix)throw new Error('Unsupported selected evidence.');selectedFile=`selected-evidence.${suffix}`;evidenceBytes=decode64(payload.data,1,10*1024*1024);
        const {data,...metadata}=payload;summary={reference:evidence.reference,metadata,selectedFile};
      }else if(payload.type==='tax-return'){
        selectedFile='selected-draft.json';evidenceBytes=new TextEncoder().encode(JSON.stringify(payload,null,2)+'\n');summary={reference:evidence.reference,metadata:{version:payload.version,type:payload.type,year:payload.year,kind:payload.kind},selectedFile};
      }else throw new Error('Unsupported selected evidence.');
    }
    const view={version:1,type:'shuug-private-case-review-view',warning,kitSha256,reviewedKit:'private-kit.json',binding:review.binding,proposalCreatedAt:kit.proposal.createdAt,proposalExpiresAt:kit.proposal.expiresAt,before:review.before,command:review.command,after:review.after,evidence:summary};
    const beforeBooks=review.before?replayCaseBooks(review.before.history,review.before.year):null,afterBooks=replayCaseBooks(review.after.history,review.after.year);
    if(afterBooks)view.caseLedgerReports={before:beforeBooks?caseBookReport(beforeBooks):null,after:caseBookReport(afterBooks)};
    await mkdir(output,{mode:0o700});owned=true;
    await writeFile(path.join(output,'private-kit.json'),bytes,{mode:0o600,flag:'wx'});
    await writeFile(path.join(output,'review.json'),JSON.stringify(view,null,2)+'\n',{mode:0o600,flag:'wx'});
    await writeFile(path.join(output,'kit-sha256.txt'),`${kitSha256}  private-kit.json\n`,{mode:0o600,flag:'wx'});
    if(selectedFile)await writeFile(path.join(output,selectedFile),evidenceBytes,{mode:0o600,flag:'wx'});
    return {ok:true,files:selectedFile?4:3,kitSha256,candidateCopies:true,fieldsReviewed:false,encryptedCorrespondenceVerified:false,approvalCreated:false,uploaded:false,warning};
  }catch(error){if(owned)await rm(output,{recursive:true,force:true});throw error;}finally{bytes.fill(0);evidenceBytes?.fill(0);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(path.resolve(process.argv[1]))).href){
  const usage='Use --public-pins FILE --kit PRIVATE_KIT.json --out NEW_PRIVATE_DIRECTORY';
  try{
    const args=process.argv.slice(2),options=new Map(),names=['--public-pins','--kit','--out'];
    for(let i=0;i<args.length;i++){const key=args[i];if(options.has(key)||!names.includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(usage);options.set(key,args[++i]);}if(names.some(key=>!options.has(key)))throw new Error(usage);
    console.log(JSON.stringify(await inspectCaseReview({pinsFile:options.get('--public-pins'),kitFile:options.get('--kit'),output:options.get('--out')})));
  }catch(error){console.error(error?.message===usage?usage:'Case review inspection failed. Choose explicit valid private inputs, public pins and a new output directory. No approval or upload occurred.');process.exitCode=1;}
}
