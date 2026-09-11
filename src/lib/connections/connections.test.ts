// @vitest-environment node
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { mkdtemp,rm,readFile,stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHmac,randomUUID } from "node:crypto";
import { saveSecrets,setting } from "./vault";
import { publicAddress } from "./public-http";
import { shopDomain,verifyShopifyHmac } from "./shopify-oauth";
import { readVisits,updateVisits } from "../visits/store";
import { prospectSchema } from "../visits/model";
let folder="";beforeEach(async()=>{folder=await mkdtemp(path.join(tmpdir(),"dealdesk-connections-"));vi.stubEnv("DEALDESK_DATA_DIR",folder);});afterEach(async()=>{vi.unstubAllEnvs();await rm(folder,{recursive:true,force:true});});
it("encrypts persisted credentials and keeps files owner-private",async()=>{saveSecrets({PRIVATE_API_TOKEN:"not-in-plaintext"});expect(setting("PRIVATE_API_TOKEN")).toBe("not-in-plaintext");const data=await readFile(path.join(folder,"connections.enc"),"utf8");expect(data).not.toContain("not-in-plaintext");expect((await stat(path.join(folder,"connections.enc"))).mode&0o777).toBe(0o600);saveSecrets({PRIVATE_API_TOKEN:""});expect(setting("PRIVATE_API_TOKEN")).toBe("");});
it("restricts store domains and verifies Shopify callback signatures",()=>{expect(shopDomain("my-store")).toBe("my-store.myshopify.com");expect(shopDomain("https://evil.com")).toBeNull();const params=new URLSearchParams({code:"123",shop:"test.myshopify.com",state:"nonce",timestamp:"123456"});const message=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("&");params.set("hmac",createHmac("sha256","secret").update(message).digest("hex"));expect(verifyShopifyHmac(params,"secret")).toBe(true);params.set("state","changed");expect(verifyShopifyHmac(params,"secret")).toBe(false);});
it("rejects private, link-local, multicast and IPv4-mapped private endpoints",()=>{for(const address of ["127.0.0.1","10.1.2.3","192.168.1.2","169.254.169.254","172.16.0.1","100.64.1.2","224.1.1.1","::1","::ffff:127.0.0.1","fe80::1","fc00::1"])expect(publicAddress(address)).toBe(false);expect(publicAddress("1.1.1.1")).toBe(true);expect(publicAddress("2606:4700:4700::1111")).toBe(true);});
it("persists merchant notes and detects conflicting list revisions",()=>{const now=new Date().toISOString(),p=prospectSchema.parse({id:randomUUID(),placeId:"ChIJ_saved_business",decisionMaker:"Test Buyer",notes:"Visit Tuesday",createdAt:now,updatedAt:now});const state=updateVisits(s=>s.prospects.push(p),0);expect(readVisits().prospects[0].decisionMaker).toBe("Test Buyer");expect(readVisits().prospects[0].name).toBe("");expect(()=>updateVisits(()=>{},0)).toThrow("another tab");expect(state.revision).toBe(1);});
