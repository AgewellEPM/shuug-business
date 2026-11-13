import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { validateTrustedConfig } from './browser/config.mjs';

const source=fileURLToPath(new URL('.',import.meta.url));
const browserFiles=['app.mjs','client.mjs','config.mjs','custody.mjs','journal-view.mjs','forms.mjs','style.css','staff-app.mjs','staff-client.mjs','staff-view.mjs','staff-updates.mjs','client-portal.mjs','client-portal-view.mjs','return-editor.mjs','return-view.mjs','return-save.mjs','opened-record.mjs','case-view.mjs','case-editor.mjs','case-books-editor.mjs','case-books-view.mjs','office-view.mjs','office-editor.mjs'];
const engineFiles=['index.mjs','model.mjs','catalog.mjs','money.mjs','individual.mjs','business.mjs','schedule-c.mjs','ordinary-tax.mjs','form-maps.mjs','pdf.mjs','data/2025-tax-table.mjs','forms/2025/templates.mjs','forms/2025/manifest.json'];
export async function prepareBrowser({output=path.join(source,'dist-browser'),config=null}={}){
  if(config)await validateTrustedConfig(config,config.uiOrigin);
  const existing=await readdir(output).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  if(existing.length)throw new Error('Choose an empty artifact directory; existing files will not be replaced.');
  const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8'));
  const vendor=[];
  for(const [name,version] of [['@hpke/core','1.10.0'],['@hpke/common','1.11.0']]){
    const installed=JSON.parse(await readFile(path.join(source,'node_modules',name,'package.json'),'utf8'));
    if(installed.version!==version||lock.packages[`node_modules/${name}`]?.version!==version)throw new Error(`The local ${name} dependency does not match the reviewed lock.`);
    vendor.push([name,version]);
  }
  const engine=path.resolve(source,'../tax-engine'),pdfPackage=JSON.parse(await readFile(path.join(engine,'node_modules/pdf-lib/package.json'),'utf8')),engineLock=JSON.parse(await readFile(path.join(engine,'package-lock.json'),'utf8'));
  if(pdfPackage.version!=='1.17.1'||engineLock.packages['node_modules/pdf-lib']?.version!=='1.17.1')throw new Error('The PDF dependency does not match the reviewed lock.');
  const templates=JSON.parse(await readFile(path.join(engine,'forms/2025/manifest.json'),'utf8'));
  for(const file of [...engineFiles,...templates.forms.map(form=>`forms/2025/${form.id}.pdf`)]){const destination=path.join(output,'tax-engine',file);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(engine,file),destination);}
  await mkdir(path.join(output,'browser'),{recursive:true});
  for(const file of browserFiles)await cp(path.join(source,'browser',file),path.join(output,'browser',file));
  await cp(path.join(source,'envelope.mjs'),path.join(output,'envelope.mjs'));
  for(const file of ['staff-contract.mjs','staff-grants.mjs','return-edit-contract.mjs','return-proposals.mjs','return-edit-approval.mjs','return-create-contract.mjs','return-creations.mjs','return-create-approval.mjs','case-model.mjs','case-books.mjs','office-validation.mjs','office-billing.mjs','office-model.mjs','case-certificate.mjs','case-contract.mjs','case-proposals.mjs','case-approval.mjs'])await cp(path.join(source,file),path.join(output,file));
  for(const [name] of vendor){
    await mkdir(path.join(output,'vendor',name),{recursive:true});
    await cp(path.join(source,'node_modules',name,'esm'),path.join(output,'vendor',name,'esm'),{recursive:true});
    await cp(path.join(source,'node_modules',name,'LICENSE'),path.join(output,'vendor',name,'LICENSE'));
  }
  await writeFile(path.join(output,'browser','trusted-config.mjs'),`// Independently supplied public configuration. No private keys.\nexport default ${JSON.stringify(config)};\n`);
  await cp(path.join(engine,'node_modules/pdf-lib/dist/pdf-lib.esm.js'),path.join(output,'vendor/pdf-lib.esm.js'));
  await cp(path.join(engine,'node_modules/pdf-lib/LICENSE.md'),path.join(output,'vendor/pdf-lib.LICENSE.md'));
  for(const [name,file]of [['@pdf-lib/standard-fonts','LICENSE.md'],['@pdf-lib/upng','LICENSE'],['pako','LICENSE'],['tslib','LICENSE.txt'],['tslib','CopyrightNotice.txt']])await cp(path.join(engine,'node_modules',name,file),path.join(output,'vendor',`${name.replaceAll('/','-')}-${file}`));
  const importmap=JSON.stringify({imports:{'@hpke/core':'./vendor/@hpke/core/esm/mod.js','@hpke/common':'./vendor/@hpke/common/esm/mod.js','@shuug/tax-engine':'./tax-engine/index.mjs','@shuug/tax-engine/pdf':'./tax-engine/pdf.mjs','pdf-lib':'./vendor/pdf-lib.esm.js'}});
  const hash=createHash('sha256').update(importmap).digest('base64');
  const csp=`default-src 'none'; script-src 'self' 'sha256-${hash}'; style-src 'self'; connect-src 'self'${config?` ${config.apiOrigin}`:''}; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'`;
  let html=await readFile(path.join(source,'browser','index.html'),'utf8');
  html=html.replace('<!-- BUILD_CSP -->',`<meta http-equiv="Content-Security-Policy" content="${csp}">`).replace('<!-- BUILD_IMPORTMAP -->',`<script type="importmap">${importmap}</script>`).replace('href="./style.css"','href="./browser/style.css"').replace('src="./app.mjs"','src="./browser/app.mjs"');
  await writeFile(path.join(output,'index.html'),html);
  const staff=await readFile(path.join(source,'browser','staff.html'),'utf8');
  await writeFile(path.join(output,'staff.html'),staff.replace('<!-- BUILD_CSP -->',`<meta http-equiv="Content-Security-Policy" content="${csp}">`).replace('<!-- BUILD_IMPORTMAP -->',`<script type="importmap">${importmap}</script>`).replace('href="./style.css"','href="./browser/style.css"').replace('src="./staff-app.mjs"','src="./browser/staff-app.mjs"'));
  await writeFile(path.join(output,'_headers'),`/*\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cross-Origin-Opener-Policy: same-origin\n  Cache-Control: no-store\n`);
  await writeFile(path.join(output,'vercel.json'),JSON.stringify({headers:[{source:'/(.*)',headers:[{key:'Content-Security-Policy',value:`${csp}; frame-ancestors 'none'`},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Cross-Origin-Opener-Policy',value:'same-origin'},{key:'Cache-Control',value:'no-store'}]}]},null,2));
  await writeFile(path.join(output,'build-public.json'),JSON.stringify({version:1,configured:!!config,dependencies:{...Object.fromEntries(vendor),'pdf-lib':'1.17.1'},taxPreparation:{year:2025,returnTypes:['1040','1065','1120S','1120'],draftOnly:true},activationAvailable:false},null,2));
  return {output,configured:!!config,activationAvailable:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);let config=null,output;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--config'&&args[i+1])config=JSON.parse(await readFile(args[++i],'utf8'));
    else if(args[i]==='--output'&&args[i+1])output=path.resolve(args[++i]);
    else throw new Error('Usage: node prepare-browser.mjs [--config independent-public-pins.json] [--output empty-artifact-directory]');
  }
  console.log(JSON.stringify(await prepareBrowser({config,output})));
}
