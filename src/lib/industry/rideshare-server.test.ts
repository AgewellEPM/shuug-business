// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { signInOwner } from "../auth/owner-session";
import { getBranding, saveBranding } from "../branding/store";
import { customerSettings, saveCustomerSettings } from "../customer-access/service";

let directory:string;
const password="Synthetic-server-setup-password";
const origin="https://server-fixture.example.com";
function setup(base=origin,input=password){return spawnSync(process.execPath,["--import","tsx","scripts/setup-rideshare-server.ts"],{cwd:process.cwd(),env:{...process.env,DEALDESK_DATA_DIR:directory,APP_BASE_URL:base,DATABASE_URL:"",DEMO_DATA:"false"},input:input+"\n",encoding:"utf8"});}
beforeEach(()=>{directory=mkdtempSync(path.join(tmpdir(),"shuug-server-setup-"));vi.stubEnv("DEALDESK_DATA_DIR",directory);vi.stubEnv("APP_BASE_URL",origin);});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
it("initializes a real private Tax Firm volume through stdin and preserves later owner configuration",()=>{
  const first=setup();expect(first.status,first.stderr).toBe(0);expect(first.stdout).not.toContain(password);
  expect(signInOwner(password)).toMatch(/^[a-f0-9]{64}$/);expect(getBranding().businessName).toBe("Gig Tax Pros");expect(customerSettings()).toMatchObject({enabled:true,servicePortal:true,pricing:false,ordering:false});
  saveBranding({tagline:"Owner's chosen tagline"});saveCustomerSettings({...customerSettings(),enabled:false});
  const again=setup(origin,"A-different-synthetic-password");expect(again.status,again.stderr).toBe(0);expect(again.stdout).toContain('"existing":true');
  expect(getBranding().tagline).toBe("Owner's chosen tagline");expect(customerSettings().enabled).toBe(false);expect(signInOwner(password)).toMatch(/^[a-f0-9]{64}$/);expect(()=>signInOwner("A-different-synthetic-password")).toThrow("Incorrect");
});
it("preserves an unrelated volume and rejects changed origins or local-only endpoints",()=>{
  const sentinel=path.join(directory,"existing-client-data.txt");writeFileSync(sentinel,"Preserve this data");
  const foreign=setup();expect(foreign.status).toBe(1);expect(readFileSync(sentinel,"utf8")).toBe("Preserve this data");expect(existsSync(path.join(directory,"rideshare-server.json"))).toBe(false);
  rmSync(sentinel);expect(setup().status).toBe(0);
  const marker=readFileSync(path.join(directory,"rideshare-server.json"),"utf8");expect(setup("https://another-host.example.com").status).toBe(1);expect(readFileSync(path.join(directory,"rideshare-server.json"),"utf8")).toBe(marker);
  for(const base of ["http://example.com","https://127.0.0.1","https://shuug.local","https://example.com/private"]){expect(setup(base).status,base).toBe(1);}
});
it("resumes an incomplete owner setup without resetting a configured password",()=>{
  const incomplete=setup(origin,"short");expect(incomplete.status).toBe(1);expect(incomplete.stdout).not.toContain('"status":"ready"');
  expect(JSON.parse(readFileSync(path.join(directory,"rideshare-server.json"),"utf8")).status).toBe("initializing");
  const resumed=setup();expect(resumed.status,resumed.stderr).toBe(0);expect(signInOwner(password)).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(readFileSync(path.join(directory,"rideshare-server.json"),"utf8")).status).toBe("ready");
});
