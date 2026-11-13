import {readFile,readdir,writeFile,mkdir,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cloudFormation,bootstrapCloudFormation} from './template.mjs';
import {validateTemplate} from './validate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function zip(files){
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const local=[],central=[];let offset=0;
  for(const {name,bytes}of files){
    if(!/^[A-Za-z0-9@_./-]+$/.test(name)||name.split('/').includes('..')||name.startsWith('/'))throw new Error('Invalid artifact path.');
    const encoded=Buffer.from(name),h=Buffer.alloc(30),c=Buffer.alloc(46);let crc=0xffffffff;
    for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(encoded.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(encoded.length,28);c.writeUInt32LE(offset,42);
    local.push(h,encoded,bytes);central.push(c,encoded);offset+=h.length+encoded.length+bytes.length;
  }
  const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,index,end]);
}
async function walk(directory,prefix=''){
  const result=[];
  for(const name of (await readdir(path.join(directory,prefix))).sort()){
    const relative=path.posix.join(prefix,name),stat=await lstat(path.join(directory,relative));
    if(stat.isSymbolicLink())throw new Error('Artifact dependencies must be regular reviewed files.');
    if(stat.isDirectory())result.push(...await walk(directory,relative));else if(stat.isFile())result.push(relative);else throw new Error('Unsupported artifact input.');
  }
  return result;
}
export async function buildArtifact(output){
  if(typeof output!=='string'||!path.isAbsolute(output))throw new Error('Choose a new absolute artifact directory.');
  validateTemplate();
  const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8')),files=[];
  const source=['envelope.mjs','firm-recovery.mjs','firm-staff.mjs','staff-contract.mjs','staff-grants.mjs','return-edit-contract.mjs','return-proposals.mjs','firm-return-edits.mjs','return-create-contract.mjs','return-creations.mjs','firm-return-creations.mjs','case-contract.mjs','case-model.mjs','case-json.mjs','case-authorization.mjs','case-books.mjs','office-validation.mjs','office-billing.mjs','office-model.mjs','case-certificate.mjs','case-proposals.mjs','firm-cases.mjs','cloud/aws/worker.mjs','cloud/aws/aws-provider.mjs'];
  for(const name of source)files.push({name,bytes:await readFile(path.join(root,name))});
  const dependencies={'@hpke/core':'1.10.0','@hpke/common':'1.11.0'};
  for(const [name,version]of Object.entries(dependencies)){
    const dir=path.join(root,'node_modules',name),installed=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
    if(installed.version!==version||lock.packages[`node_modules/${name}`]?.version!==version)throw new Error('Installed crypto dependency differs from reviewed lock.');
    for(const file of await walk(dir))files.push({name:path.posix.join('node_modules',name,file),bytes:await readFile(path.join(dir,file))});
  }
  files.push({name:'package.json',bytes:Buffer.from(JSON.stringify({name:'shuug-isolated-key-worker',version:'1.0.0',private:true,type:'module'}))});
  files.sort((a,b)=>a.name.localeCompare(b.name,'en'));if(new Set(files.map(f=>f.name)).size!==files.length)throw new Error('Duplicate artifact path.');
  const artifact=zip(files),template=Buffer.from(JSON.stringify(cloudFormation(),null,2)+'\n'),bootstrap=Buffer.from(JSON.stringify(bootstrapCloudFormation(),null,2)+'\n');
  const manifest={version:1,artifactSha256:digest(artifact),artifactSha256Base64:createHash('sha256').update(artifact).digest('base64'),cloudFormationSha256:digest(template),bootstrapSha256:digest(bootstrap),dependencies,files:files.map(f=>({path:f.name,sha256:digest(f.bytes),bytes:f.bytes.length})),runtime:'nodejs24.x',awsSdk:'AWS-managed; key operations blocked until exact versions are attested',provisioned:false};
  let owned=false;
  try{
    await mkdir(output,{mode:0o700});owned=true;
    for(const [name,bytes]of [['lambda.zip',artifact],['cloudformation.json',template],['bootstrap.json',bootstrap],['artifact-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]])await writeFile(path.join(output,name),bytes,{mode:0o600,flag:'wx'});
  }catch(error){if(owned)await rm(output,{recursive:true,force:true});throw error;}
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw new Error('Usage: node build-artifact.mjs --output /new/absolute/directory');
  const result=await buildArtifact(path.resolve(args[1]));console.log(JSON.stringify({ok:true,artifactSha256:result.artifactSha256,artifactSha256Base64:result.artifactSha256Base64,files:result.files.length,provisioned:false},null,2));
}
