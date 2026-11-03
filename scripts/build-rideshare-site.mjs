import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'deployments/rideshare-tax-pros/.vercel/output');
const source = path.join(root, 'public/rideshare-tax-pros');
mkdirSync(path.join(destination, 'static'), { recursive: true });
cpSync(source, path.join(destination, 'static'), { recursive: true });
const config = JSON.parse(readFileSync(path.join(source, 'site-config.json'), 'utf8'));
for (const key of ['workspaceUrl', 'drakePortalUrl']) if (config[key] !== null) {
  const url = new URL(config[key]);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} must be a public HTTPS URL.`);
}
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
writeFileSync(path.join(destination, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/.*', headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }, continue: true },
  { src: '/site-config.json', headers: { 'Cache-Control': 'no-store' }, continue: true },
  { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=86400' }, continue: true },
  { handle: 'filesystem' },
] }, null, 2));
console.log(`Rideshare Tax Pros static deployment prepared at ${destination}`);
