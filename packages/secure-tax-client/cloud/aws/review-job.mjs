import {readFileSync,writeFileSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),values=new Map();
for(let i=0;i<args.length;i++){
  const key=args[i];if(values.has(key))throw new Error('Duplicate argument.');
  if(key==='--confirm-identity-and-fingerprint')values.set(key,true);else values.set(key,args[++i]);
}
if(values.size!==4||!values.get('--confirm-identity-and-fingerprint')||!['--job','--version-id','--out'].every(key=>typeof values.get(key)==='string'))throw new Error('Usage: node review-job.mjs --job FILE --version-id IMMUTABLE-S3-VERSION --out NEW-EVENT-FILE --confirm-identity-and-fingerprint');
const descriptor=openSync(values.get('--job'),constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
try{const stat=fstatSync(descriptor);if(!stat.isFile()||stat.size>30*1024*1024)throw new Error('Review a bounded regular job file.');bytes=readFileSync(descriptor);}finally{closeSync(descriptor);}
const job=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
if(job.version!==1||typeof job.jobId!=='string'||job.jobId.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==job.jobId||job.approval?.reviewed!==true||typeof job.operation!=='string')throw new Error('Review the exact supported job and explicit approval first.');
const event={version:1,jobId:job.jobId,jobVersionId:values.get('--version-id'),approvedSha256:createHash('sha256').update(bytes).digest('hex')};
writeFileSync(values.get('--out'),JSON.stringify(event,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({jobId:job.jobId,operation:job.operation,reviewReference:job.approval.reviewReference,recipientKeyId:job.approval.recipientKeyId,approvedSha256:event.approvedSha256,resourceCreated:false},null,2));
