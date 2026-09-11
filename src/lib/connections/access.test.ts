// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({headers:new Headers(),secret:""}));
vi.mock("next/headers",()=>({headers:async()=>mocks.headers,cookies:async()=>({get:()=>undefined})}));
vi.mock("./vault",()=>({setting:()=>mocks.secret,appBaseUrl:()=>"http://localhost:3000"}));
import { requireWorkspaceAccess } from "./access";
beforeEach(()=>{mocks.secret="";mocks.headers=new Headers({host:"localhost:3000","x-forwarded-host":"localhost:3000"});vi.stubEnv("NODE_ENV","development");});
afterEach(()=>vi.unstubAllEnvs());
it("accepts Next's same-host forwarded header for the local workspace",async()=>{await expect(requireWorkspaceAccess()).resolves.toBeUndefined();});
it("rejects foreign origins and forwarded hosts",async()=>{mocks.headers.set("origin","https://example.com");await expect(requireWorkspaceAccess()).rejects.toThrow("local owner");mocks.headers.delete("origin");mocks.headers.set("x-forwarded-host","example.com");await expect(requireWorkspaceAccess()).rejects.toThrow("local owner");});
it("requires the gateway owner token in production even on localhost",async()=>{vi.stubEnv("NODE_ENV","production");await expect(requireWorkspaceAccess()).rejects.toThrow("local owner");mocks.secret="test-owner-secret";mocks.headers.set("authorization","Bearer test-owner-secret");await expect(requireWorkspaceAccess()).resolves.toBeUndefined();});
