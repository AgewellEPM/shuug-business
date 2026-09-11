// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { fetchQboCustomers } from "./quickbooks";
const state=vi.hoisted(()=>({realm:"company"}));
vi.mock("./config",()=>({getQuickBooksConfig:()=>({clientId:"fixture",clientSecret:"fixture",environment:"sandbox"}),quickBooksUrls:()=>({apiBase:"https://sandbox-quickbooks.api.intuit.com"})}));
vi.mock("./token-store",()=>({getQboTokens:()=>({accessToken:"fixture",refreshToken:"fixture",realmId:state.realm,expiresAt:Date.now()+3600000}),setQboTokens:vi.fn()}));
beforeEach(()=>{state.realm="company";vi.stubGlobal("fetch",vi.fn());});
afterEach(()=>vi.unstubAllGlobals());

it("reads every customer page including inactive accounts and preserves contact fields",async()=>{
  const fetch=vi.mocked(globalThis.fetch);
  fetch.mockResolvedValueOnce(Response.json({QueryResponse:{Customer:Array.from({length:1000},(_,i)=>({Id:String(i+1),DisplayName:`Customer ${i+1}`}))}}));
  fetch.mockResolvedValueOnce(Response.json({QueryResponse:{Customer:[{Id:"1001",CompanyName:"Example market",GivenName:"Example",FamilyName:"Buyer",PrimaryEmailAddr:{Address:"buyer@example.com"},PrimaryPhone:{FreeFormNumber:"012345"},BillAddr:{Line1:"1 Example St",City:"Example",CountrySubDivisionCode:"MA"},Active:false}]}}));
  const customers=await fetchQboCustomers();
  expect(customers).toHaveLength(1001);
  expect(customers[1000]).toMatchObject({externalId:"1001",company:"Example market",buyerName:"Example Buyer",phone:"012345",shippingAddress:"1 Example St, Example, MA"});
  expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("query")).toContain("startposition 1001 maxresults 1000");
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("query")).toContain("Active in (true, false)");
  expect(fetch.mock.calls.every(([,init])=>init?.method==="GET")).toBe(true);
});

it("rejects duplicate provider IDs and an account switch during a preview",async()=>{
  const fetch=vi.mocked(globalThis.fetch);
  fetch.mockResolvedValueOnce(Response.json({QueryResponse:{Customer:[{Id:"1"},{Id:"1"}]}}));
  await expect(fetchQboCustomers()).rejects.toThrow("repeated or missing customer ID");
  fetch.mockImplementationOnce(async()=>{state.realm="another-company";return Response.json({QueryResponse:{Customer:[{Id:"2"}]}});});
  await expect(fetchQboCustomers()).rejects.toThrow("company changed");
});
