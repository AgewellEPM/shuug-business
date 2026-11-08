// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { workspaceDatabase } from '../workspace/database';
import { setting } from '../connections/vault';
import { bankReturnUri, driverProviderSetup, saveDriverProviderSetup } from './provider-setup';
import { GET, POST } from '@/app/api/setup/driver-connections/route';
vi.mock('@/lib/auth/identity', () => ({ requireOwnerAccess: vi.fn() }));
import { requireOwnerAccess } from '@/lib/auth/identity';
let directory: string;
beforeEach(() => {
  directory=mkdtempSync(`${tmpdir()}/gig-provider-setup-`);
  for (const [key,value] of Object.entries({DEALDESK_DATA_DIR:directory,APP_BASE_URL:'https://workspace.example.com',PLAID_ENV:'sandbox',PLAID_CLIENT_ID:'',PLAID_SECRET:'',PLAID_IOS_REDIRECT_URI:'',PLAID_LIVE_ENABLED:'false',UBER_DRIVER_CLIENT_ID:'',UBER_DRIVER_CLIENT_SECRET:'',UBER_DRIVER_APPROVED:'false'})) vi.stubEnv(key,value);
  vi.mocked(requireOwnerAccess).mockResolvedValue({id:'owner',memberId:'owner',name:'Owner',email:'',role:'Owner',isOwner:true});
  for (const key of ['GOOGLE_MAPS_DRIVER_SERVER_KEY','GOOGLE_MAPS_DRIVER_ROUTES_ENABLED','GOOGLE_MAPS_SERVER_KEY']) vi.stubEnv(key,'');
});
afterEach(() => {vi.unstubAllEnvs();vi.clearAllMocks();rmSync(directory,{recursive:true,force:true});});
const bank = (patch = {}) => ({provider:'plaid',environment:'sandbox',clientId:'client-a',secret:'synthetic-only-bank-secret',redirectUri:bankReturnUri,iosAppId:'',liveEnabled:false,...patch});
it('persists encrypted credentials and returns setup flags without secrets or credential values', () => {
  const summary=saveDriverProviderSetup(bank());
  expect(summary.bank).toMatchObject({clientIdConfigured:true,secretConfigured:true,environment:'sandbox',associationVerified:false});
  expect(JSON.stringify(summary)).not.toContain('synthetic-only-bank-secret');
  expect(JSON.stringify(summary)).not.toContain('client-a');
  expect(readFileSync(`${directory}/connections.enc`,'utf8')).not.toContain('synthetic-only-bank-secret');
  saveDriverProviderSetup(bank({clientId:'',secret:''}));expect(setting('PLAID_SECRET')).toBe('synthetic-only-bank-secret');
});
it('requires actual app identity/association confirmation for production and refuses unknown redirects or provider keys', () => {
  expect(() => saveDriverProviderSetup(bank({environment:'production',liveEnabled:true}))).toThrow('Live linking requires');
  expect(() => saveDriverProviderSetup(bank({redirectUri:'https://attacker.example/bank-return'}))).toThrow();
  expect(() => saveDriverProviderSetup(bank({iosAppId:'FAKE.com.other.app'}))).toThrow('signed application');
  expect(() => saveDriverProviderSetup({...bank(),WORKSPACE_OWNER_PASSWORD_HASH:'injected'})).toThrow();
  saveDriverProviderSetup(bank({environment:'production',liveEnabled:true,iosAppId:'ABCDEFGHIJ.com.ridesharetaxpros.driver',associationVerified:true}));
  expect(driverProviderSetup().bank.liveEnabled).toBe(true);
});
it('preserves active bank and pending-link credentials while allowing linking to be paused', () => {
  saveDriverProviderSetup(bank());
  workspaceDatabase(db=>{db.exec('CREATE TABLE driver_bank_items(connected INTEGER); INSERT INTO driver_bank_items VALUES(1); CREATE TABLE driver_bank_links(itemId TEXT,at INTEGER);');},true);
  expect(() => saveDriverProviderSetup(bank({clientId:'different-app'}))).toThrow('Disconnect existing');
  workspaceDatabase(db=>{db.exec('DELETE FROM driver_bank_items');db.prepare('INSERT INTO driver_bank_links VALUES(NULL,?)').run(Date.now());},true);
  expect(() => saveDriverProviderSetup(bank({secret:'rotated-secret'}))).toThrow('pending bank');
  saveDriverProviderSetup(bank({clientId:'',secret:'',liveEnabled:false}));expect(driverProviderSetup().bank.liveEnabled).toBe(false);
});
it('preserves Uber application credentials needed to revoke existing driver authorizations', () => {
  saveDriverProviderSetup({provider:'uber',clientId:'uber-a',secret:'synthetic-uber-secret',approved:true});
  workspaceDatabase(db=>db.exec("CREATE TABLE gig_uber_links(secrets TEXT); INSERT INTO gig_uber_links VALUES('encrypted-token');"),true);
  expect(() => saveDriverProviderSetup({provider:'uber',clientId:'uber-b',secret:'different',approved:true})).toThrow('Disconnect existing Uber');
  saveDriverProviderSetup({provider:'uber',clientId:'',secret:'',approved:false});expect(setting('UBER_DRIVER_CLIENT_SECRET')).toBe('synthetic-uber-secret');expect(driverProviderSetup().uber.approved).toBe(false);
});
it('requires a dedicated Google driver key, encrypts it and keeps it private when enabling or pausing routes', () => {
  vi.stubEnv('GOOGLE_MAPS_SERVER_KEY','staff-visits-key-only');
  expect(driverProviderSetup().googleRoutes).toEqual({serverKeyConfigured:false,enabled:false,ready:false});
  expect(() => saveDriverProviderSetup({provider:'googleRoutes',serverKey:'',liveEnabled:true})).toThrow('dedicated driver');
  expect(() => saveDriverProviderSetup({provider:'googleRoutes',serverKey:'bad key',liveEnabled:false})).toThrow('server Routes API key');
  const summary=saveDriverProviderSetup({provider:'googleRoutes',serverKey:'synthetic-driver-server-key',liveEnabled:true});
  expect(summary.googleRoutes).toEqual({serverKeyConfigured:true,enabled:true,ready:true});
  expect(JSON.stringify(summary)).not.toContain('synthetic-driver-server-key');
  expect(readFileSync(`${directory}/connections.enc`,'utf8')).not.toContain('synthetic-driver-server-key');
  saveDriverProviderSetup({provider:'googleRoutes',serverKey:'',liveEnabled:false});
  expect(setting('GOOGLE_MAPS_DRIVER_SERVER_KEY')).toBe('synthetic-driver-server-key');
  expect(driverProviderSetup().googleRoutes).toEqual({serverKeyConfigured:true,enabled:false,ready:false});
});
it('enforces the actual owner route and exact same-origin writes with bounded input', async () => {
  const url='https://workspace.example.com/api/setup/driver-connections';
  const post=(input:object,origin='https://workspace.example.com')=>POST(new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)}));
  expect((await post(bank(),'https://attacker.example')).status).toBe(403);
  expect((await post(bank())).status).toBe(200);
  const summary=await GET();expect(summary.headers.get('cache-control')).toContain('no-store');expect(await summary.text()).not.toContain('synthetic-only-bank-secret');
  vi.mocked(requireOwnerAccess).mockRejectedValue(new Error('client is not owner'));
  expect((await GET()).status).toBe(403);expect((await post(bank())).status).toBe(403);
});
