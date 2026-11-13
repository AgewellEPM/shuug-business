import assert from 'node:assert/strict';
import { constants, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactFiles, sha, uploadedFiles } from './prepare-contacts-release.mjs';

const STATIC = new Set(['sales.html','sales.js','local-offices.js','local-offices.css','local-contacts.js',...['leaflet.js','leaflet.css','LICENSE','images/layers.png','images/layers-2x.png','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png'].map(name=>'vendor/leaflet-1.9.4/'+name)]);
const MODULES = new Set(['service.mjs','discovery.mjs','local-discovery.mjs','business-registry.mjs','geocoding.mjs','public-data.mjs','local-contacts.mjs']);
const permitted = name => name.startsWith('static/') ? STATIC.has(name.slice(7)) : /^functions\/api\/(sales|offices|sales-webhook|sales-mail-webhook)\.func\/[^/]+$/.test(name) && MODULES.has(path.basename(name));
export function validateMapConfig(before, after) {
  const original = JSON.parse(before), candidate = JSON.parse(after), base = original.routes.find(route=>route.src==='/.*'&&route.headers?.['Content-Security-Policy']).headers['Content-Security-Policy'];
  assert(base.includes("img-src 'self' data:;"), 'Review the current source policy before extending private map images.');
  const route = { src:'/sales(?:\\.html)?', headers:{'Content-Security-Policy':base.replace("img-src 'self' data:","img-src 'self' data: https://tile.openstreetmap.org")}, continue:true };
  assert.deepEqual(candidate.routes.filter(item=>item.src===route.src),[route], 'Only the one private image source may be added.');
  if(original.routes.some(item=>item.src===route.src)) { assert.deepEqual(candidate,original,'All deployed routes, CSP and headers must stay exact.'); return route; }
  assert.deepEqual({...candidate,routes:candidate.routes.filter(item=>item.src!==route.src)},original,'All existing routes, public CSP and headers must stay exact.');
  return route;
}
export function prepareLocalMapRelease({baseline,updated,inventory,deployment,output,projectFile}) {
  assert.match(deployment,/^dpl_[A-Za-z0-9]+$/);assert(!existsSync(output),'Use a new release directory.');
  const project=JSON.parse(readFileSync(projectFile));assert.equal(project.projectId,'prj_bOMkaHb4SWjMAgwXfEJa7mQfjRrz');assert.equal(project.orgId,'team_KbZcSA3vllTFUuB0DJJVeW83');
  const uploaded=uploadedFiles(JSON.parse(readFileSync(inventory))),oldNames=artifactFiles(baseline),names=artifactFiles(updated),originals=new Map(),changed=[],added=[],protectedPublic=[];
  assert.deepEqual([...uploaded.keys()].sort(),oldNames,'The baseline must be the exact current deployment.');
  for(const name of oldNames){const bytes=readFileSync(path.join(baseline,name));assert.equal(sha(bytes,'sha1'),uploaded.get(name),`Production baseline differs: ${name}`);assert(names.includes(name),`Production artifact removed: ${name}`);originals.set(name,bytes);}
  const privateMapRoute=validateMapConfig(originals.get('config.json'),readFileSync(path.join(updated,'config.json')));
  for(const name of names){const bytes=readFileSync(path.join(updated,name));
    if(!originals.has(name)){assert(permitted(name),`Unexpected artifact: ${name}`);added.push(name);}
    else if(!bytes.equals(originals.get(name))){assert(name==='config.json'||permitted(name),`Protected artifact changed: ${name}`);changed.push(name);}
    if(name.startsWith('static/')&&!STATIC.has(name.slice(7)))protectedPublic.push({path:name,sha1:sha(bytes,'sha1'),sha256:sha(bytes)});
  }
  mkdirSync(path.join(output,'.vercel'),{recursive:true});cpSync(updated,path.join(output,'.vercel/output'),{recursive:true,mode:constants.COPYFILE_FICLONE});cpSync(projectFile,path.join(output,'.vercel/project.json'));
  const receipt={ok:true,preparedAt:new Date().toISOString(),baselineDeployment:deployment,preparedOutput:path.join(output,'.vercel/output'),projectId:project.projectId,orgId:project.orgId,baselineVerifiedArtifacts:oldNames.length,
    existingRoutesHeadersCspPreserved:true,privateMapRoute,workflowReadChecks:true,revenueReadChecks:true,localMapReadChecks:true,localContactReadChecks:names.includes('static/local-contacts.js'),changed,added,removed:[],protectedPublic,
    files:names.map(name=>{const bytes=readFileSync(path.join(updated,name));return{path:name,sha1:sha(bytes,'sha1'),sha256:sha(bytes)};})};
  writeFileSync(path.join(output,'preservation-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [baseline,updated,inventory,deployment,output,projectFile]=process.argv.slice(2),r=prepareLocalMapRelease({baseline,updated,inventory,deployment,output,projectFile});
  console.log(JSON.stringify({ok:r.ok,baselineVerifiedArtifacts:r.baselineVerifiedArtifacts,artifacts:r.files.length,changed:r.changed,added:r.added,protectedPublic:r.protectedPublic.length,existingRoutesHeadersCspPreserved:r.existingRoutesHeadersCspPreserved}));
}
