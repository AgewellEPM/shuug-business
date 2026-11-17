// @vitest-environment node
import {it,expect,vi,afterEach} from "vitest";
import {socialStart,socialConfig} from "./handlers";
afterEach(()=>vi.unstubAllEnvs());
it("rejects foreign browser requests before reading their body and never grants permissive CORS",async()=>{
 vi.stubEnv("APP_BASE_URL","https://workspace.example.com");vi.stubEnv("SHUUG_SECURE_TAX_TRUSTED_ORIGIN","https://portal.example.net");
 const request=new Request("https://workspace.example.com/api/auth/social/start",{method:"POST",headers:{Origin:"https://foreign.example","Content-Type":"application/json"},body:'{"provider":"google"}'});
 const response=await socialStart(request);expect(response.status).toBe(403);expect(request.bodyUsed).toBe(false);expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
 const config=socialConfig(new Request("https://workspace.example.com/api/auth/social/config",{headers:{Origin:"https://portal.example.net"}}));expect(config.status).toBe(200);expect(config.headers.get("Access-Control-Allow-Origin")).toBe("https://portal.example.net");expect(config.headers.get("Cache-Control")).toContain("no-store");
});
