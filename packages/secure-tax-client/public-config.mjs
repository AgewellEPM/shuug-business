// Converts independently approved PUBLIC pins for each distribution target.
// No private bundle is accepted, read or created by this tool.
import {readFile,mkdir,open,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateTrustedConfig} from './browser/config.mjs';
export async function publicConfiguration(pins,{apiOrigin,uiOrigin}){
 const names=['workspaceId','signerPublicKey','firmRecoveryPublicKey'];
 if(!pins||Object.keys(pins).sort().join('|')!==names.sort().join('|'))throw new Error('Only public firm pins are accepted. Never select a private-key bundle.');
 const browser=await validateTrustedConfig({version:1,uiOrigin,apiOrigin,...pins},uiOrigin);
 const api=new URL(apiOrigin);
 if(api.port||!api.hostname.includes('.'))throw new Error('Choose the exact public HTTPS API origin supported by the native signed configuration.');
 const native={version:1,workspaceOrigin:apiOrigin,...pins};
 const environment={SHUUG_SECURE_TAX_WORKSPACE_ID:pins.workspaceId,SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY:pins.signerPublicKey,SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY:pins.firmRecoveryPublicKey,SHUUG_SECURE_TAX_TRUSTED_ORIGIN:uiOrigin};
 return {browser,native,environment};
}
export async function writePublicConfiguration(configuration,output){
 // The whole new directory is owned by this invocation. An existing path is
 // preserved, even when empty, and no partial provisioning package is kept.
 await mkdir(output,{mode:0o700});
 const created=[];
 try{
  for(const [name,body] of [['browser-public.json',JSON.stringify(configuration.browser,null,2)+'\n'],['SecureTaxTrustedPins.json',JSON.stringify(configuration.native,null,2)+'\n'],['api-public.env',Object.entries(configuration.environment).map(([k,v])=>`${k}=${v}`).join('\n')+'\n']]){
   const file=path.join(output,name),handle=await open(file,'wx',0o600);created.push(file);
   try{await handle.writeFile(body);}finally{await handle.close();}
  }
 }catch(error){for(const file of created){try{await unlink(file);}catch{}}try{await rmdir(output);}catch{}throw error;}
 return {output,privateKeysIncluded:false,activationPerformed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i+=2){const name=args[i];if(!['--pins','--api-origin','--ui-origin','--output'].includes(name)||!args[i+1]||values[name])throw new Error('Invalid public configuration arguments.');values[name]=args[i+1];}
  if(Object.keys(values).length!==4)throw new Error('Missing public configuration arguments.');
  const bytes=await readFile(values['--pins']);if(bytes.length>4096)throw new Error('Public pins file is too large.');
  const config=await publicConfiguration(JSON.parse(bytes.toString('utf8')),{apiOrigin:values['--api-origin'],uiOrigin:values['--ui-origin']});
  console.log(JSON.stringify(await writePublicConfiguration(config,values['--output'])));
 }catch{console.error('Use --pins PUBLIC-ONLY.json --api-origin https://api.example --ui-origin https://client.example --output NEW-DIRECTORY. No keys or activation were performed.');process.exitCode=1;}
}
