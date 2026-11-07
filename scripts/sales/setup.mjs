import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { digest, secret } from '../../sales/model.mjs';

const dir = path.join(homedir(),'.config/gigtax-sales');
mkdirSync(dir,{recursive:true,mode:0o700});
const file = path.join(dir,'installation.json');
const config = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : {};
config.GIGTAX_TINKY_KEY ||= readFileSync(path.join(homedir(),'.config/tinkysdr/key'),'utf8').trim();
config.GIGTAX_SALES_ORIGIN = 'https://gigtax.pro';
config.GIGTAX_SALES_SESSION_KEY ||= randomBytes(32).toString('hex');
const ownerFile = path.join(dir,'owner-code');
if (!existsSync(ownerFile)) writeFileSync(ownerFile,secret(),{mode:0o600,flag:'wx'});
config.GIGTAX_SALES_OWNER_HASH = digest(readFileSync(ownerFile,'utf8').trim());
const boards = JSON.parse(config.GIGTAX_SALES_BOARDS || '{}');
async function request(route,method='GET',body) {
  const r=await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev'+route,{method,headers:{Authorization:`Bearer ${config.GIGTAX_TINKY_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const j=await r.json(); if(!r.ok)throw new Error(`Backend setup failed: HTTP ${r.status}. No credential was printed.`); return j;
}
const me=await request('/api/outreach/me');
if(me.role!=='master'||me.org_id!=='luke-tinkytown')throw new Error('The installed credential is not the expected TinkySDR owner.');
const existing=(await request('/api/outreach/boards')).boards;
const names={offices:'GigTax · Independent Office Sales',agents:'GigTax · Sales Access',events:'GigTax · Sales Activity',enrollments:'GigTax · Office Enrollments'};
for(const [kind,name] of Object.entries(names)) {
  if(!boards[kind]) {
    const found=existing.find(b=>b.name===name&&!b.archived_at);
    const board=found || (await request('/api/outreach/boards','POST',{name,config_json:{purpose:'gigtax-sales-v1',kind,terms:null}})).board;
    if(!board?.id)throw new Error('Backend did not confirm board creation. Check before retrying.');
    boards[kind]=board.id; config.GIGTAX_SALES_BOARDS=JSON.stringify(boards);
    writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});
  }
}
console.log(JSON.stringify({ready:true,org:me.org_id,boards,localOwnerCode:ownerFile,localInstallation:file,terms:'Not published: owner approval required'}));
