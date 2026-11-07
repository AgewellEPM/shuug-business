import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const config=JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/installation.json'),'utf8'));
const cwd=path.resolve(import.meta.dirname,'../../deployments/rideshare-tax-pros');
for(const [name,value] of Object.entries(config)) {
  if(!name.startsWith('GIGTAX_'))continue;
  const result=spawnSync('vercel',['env','add',name,'production','--sensitive','--force','--yes','--cwd',cwd],{input:String(value),encoding:'utf8',timeout:60000});
  if(result.status!==0) {
    let diagnostic=String(result.stderr || result.error?.message || 'Unknown Vercel error');
    for(const value of Object.values(config)) if(String(value).length>5)diagnostic=diagnostic.replaceAll(String(value),'[redacted]');
    throw new Error(`Could not save ${name}: ${diagnostic.slice(-1200)}`);
  }
  console.log(`Saved ${name} as a sensitive production variable.`);
}
