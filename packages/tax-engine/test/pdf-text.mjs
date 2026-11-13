import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// A bounded real PDF extraction. File input avoids the observed Node/macOS
// synchronous stdin-pipe stall; cleanup runs on success, failure and timeout.
export function pdfText(bytes,mode='-bbox-layout'){
  if(!['-bbox-layout','-layout','-raw'].includes(mode))throw new Error('Unknown PDF extraction mode.');
  const directory=mkdtempSync(path.join(tmpdir(),'shuug-pdf-proof-'));
  try{
    const file=path.join(directory,'synthetic.pdf');writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
    return execFileSync('pdftotext',[mode,file,'-'],{maxBuffer:4*1024*1024,timeout:15000,killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']}).toString();
  }finally{rmSync(directory,{recursive:true,force:true});}
}
