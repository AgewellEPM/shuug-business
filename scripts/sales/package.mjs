import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export function packageSales(root, destination) {
  const dir = path.join(destination,'functions/api/sales.func');
  mkdirSync(dir,{ recursive:true });
  cpSync(path.join(root,'sales'),dir,{ recursive:true, filter:source => !source.endsWith('.test.mjs') });
  writeFileSync(path.join(dir,'.vc-config.json'),JSON.stringify({ runtime:'nodejs22.x',handler:'handler.mjs',launcherType:'Nodejs',maxDuration:60 },null,2));
  const webhook=path.join(destination,'functions/api/sales-webhook.func');
  mkdirSync(webhook,{recursive:true});cpSync(path.join(root,'sales'),webhook,{recursive:true,filter:source=>!source.endsWith('.test.mjs')});
  writeFileSync(path.join(webhook,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'webhook.mjs',launcherType:'Nodejs',maxDuration:60},null,2));
}
