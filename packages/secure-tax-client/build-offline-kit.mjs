import {readFile,readdir,mkdir,writeFile,lstat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const source=fileURLToPath(new URL('.',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['envelope.mjs','firm-recovery.mjs','firm-staff.mjs','staff-contract.mjs','staff-grants.mjs','offline-cli.mjs','staff-offline-cli.mjs'];
async function walk(directory,prefix=''){
  const result=[];
  for(const name of (await readdir(path.join(directory,prefix))).sort()){const relative=path.posix.join(prefix,name),info=await lstat(path.join(directory,relative));if(info.isSymbolicLink())throw new Error('Offline kit dependencies must be regular reviewed files.');if(info.isDirectory())result.push(...await walk(directory,relative));else if(info.isFile())result.push(relative);else throw new Error('Unsupported offline kit input.');}return result;
}
const instructions=`# Shuug separate-computer key kit

Run this kit on the firm's separately trusted key computer. Node.js 22.13 or
newer is required. It includes lock-matched local crypto dependencies; no npm
download, application server, tax engine or cloud account is needed at runtime.

The kit contains public source code and a SHA-256 inventory. It has no firm keys,
passphrases, credentials, client data or automatic initialization. Verify its
inventory through the firm's trusted software-release channel before use.

Use node offline-cli.mjs for init/sign/recover and node staff-offline-cli.mjs for
grant/share/recover-device/revoke. Invoking either without arguments prints its
required explicit options and exits without key operations. Pass the private
bundle, public pins and selected inputs explicitly. Passphrases use a selected
file descriptor, never a command argument. Every operation requires the existing
--confirm-off-host acknowledgment; this flag does not verify physical separation.

Keep the encrypted firm bundle, its separate unlock passphrase and recoverable
backups away from the app/data host. Distribute only the public pins, signed
manifests/grants/capsules and revocations through verified channels. Never replace
an existing firm's pins with newly generated keys. Existing outputs are not
overwritten; all readable recovered objects remain private to this key computer.

Shuug also supplies a separately controlled cloud key-service deployment package.
These are two supported custody options. They must preserve the chosen firm's
trust pins. Switching an existing firm or sharing keys between options needs an
explicit migration/recovery design; separate initialization creates separate keys.
Neither this kit nor the cloud package enables new account activation or filing.
`;
export async function buildOfflineKit(output){
  if(typeof output!=='string'||!path.isAbsolute(output))throw new Error('Select a new absolute offline kit directory.');
  const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8')),dependencies={'@hpke/core':'1.10.0','@hpke/common':'1.11.0'},contents=[];
  for(const file of files)contents.push({path:file,bytes:await readFile(path.join(source,file))});
  for(const [name,version]of Object.entries(dependencies)){const directory=path.join(source,'node_modules',name),installed=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));if(installed.version!==version||lock.packages[`node_modules/${name}`]?.version!==version)throw new Error('The crypto dependencies differ from the reviewed lock.');for(const file of await walk(directory))contents.push({path:path.posix.join('node_modules',name,file),bytes:await readFile(path.join(directory,file))});}
  contents.push({path:'package.json',bytes:Buffer.from(JSON.stringify({name:'shuug-separate-computer-key-kit',version:'1.0.0',private:true,type:'module',engines:{node:'>=22.13.0'},dependencies},null,2)+'\n')},{path:'README.md',bytes:Buffer.from(instructions)});contents.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const manifest={version:1,purpose:'separate-computer-key-custody',dependencies,containsPrivateKeys:false,containsClientData:false,initialized:false,files:contents.map(file=>({path:file.path,sha256:sha(file.bytes),bytes:file.bytes.length}))};
  let owned=false;
  try{await mkdir(output,{mode:0o700});owned=true;for(const file of contents){const destination=path.join(output,file.path);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await writeFile(destination,file.bytes,{mode:0o600,flag:'wx'});}await writeFile(path.join(output,'kit-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});}
  catch(error){if(owned)await rm(output,{recursive:true,force:true});throw error;}return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output')throw new Error('Usage: node build-offline-kit.mjs --output /new/absolute/directory');const result=await buildOfflineKit(path.resolve(args[1]));console.log(JSON.stringify({ok:true,files:result.files.length,initialized:false,containsPrivateKeys:false}));}
