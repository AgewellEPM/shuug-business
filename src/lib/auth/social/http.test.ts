// @vitest-environment node
import {it,expect,vi,afterEach} from "vitest";
import {socialStart,socialConfig} from "./handlers";
import {socialCallbackUrl} from "./http";
afterEach(()=>vi.unstubAllEnvs());
it("rejects foreign browser requests before reading their body and never grants permissive CORS",async()=>{
 vi.stubEnv("APP_BASE_URL","https://workspace.example.com");vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN","https://portal.example.net");
 const request=new Request("https://workspace.example.com/api/auth/social/start",{method:"POST",headers:{Origin:"https://foreign.example","Content-Type":"application/json"},body:'{"provider":"google"}'});
 const response=await socialStart(request);expect(response.status).toBe(403);expect(request.bodyUsed).toBe(false);expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
 const config=socialConfig(new Request("https://workspace.example.com/api/auth/social/config",{headers:{Origin:"https://portal.example.net"}}));expect(config.status).toBe(200);expect(config.headers.get("Access-Control-Allow-Origin")).toBe("https://portal.example.net");expect(config.headers.get("Cache-Control")).toContain("no-store");
});
it("accepts the exact HTTPS callback through Next's container URL while rejecting foreign or ambiguous proxy hosts",()=>{
 vi.stubEnv("APP_BASE_URL","https://workspace.example.com");
 const path="/api/auth/social/google/callback?state=synthetic";
 expect(socialCallbackUrl(new Request("https://workspace.example.com"+path),"google").searchParams.get("state")).toBe("synthetic");
 const headers={host:"workspace.example.com","x-forwarded-proto":"https","x-forwarded-host":"workspace.example.com"};
 expect(socialCallbackUrl(new Request("https://0.0.0.0:8080"+path,{headers}),"google").pathname).toBe(path.split("?")[0]);
 for(const changed of [{host:"foreign.example"},{"x-forwarded-proto":"http"},{"x-forwarded-proto":"https,http"},{"x-forwarded-host":"foreign.example"},{"x-forwarded-host":"workspace.example.com,foreign.example"}]) {
  expect(()=>socialCallbackUrl(new Request("https://0.0.0.0:8080"+path,{headers:{...headers,...changed}}),"google")).toThrow();
 }
 expect(()=>socialCallbackUrl(new Request("https://0.0.0.0:8080"+path),"google")).toThrow();
 expect(()=>socialCallbackUrl(new Request("https://workspace.example.com/api/auth/social/apple/callback"),"google")).toThrow();
});
