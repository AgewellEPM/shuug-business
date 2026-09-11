import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { AmazonMarketing } from "./AmazonMarketing";
import type { AdsPlan,CampaignReceipt } from "@/lib/amazon-ads/model";
const api=vi.hoisted(()=>({accounts:vi.fn(),workspace:vi.fn(),save:vi.fn(),submit:vi.fn()}));
vi.mock("@/app/amazon-marketing/actions",()=>({loadAdsAccountsAction:api.accounts,loadAdsWorkspaceAction:api.workspace,saveAdsDraftAction:api.save,submitAdsDraftAction:api.submit,adsDraftStateAction:vi.fn(),advertisedProductsAction:vi.fn(),checkAdsReportAction:vi.fn(),moreAdsCampaignsAction:vi.fn(),observeAdsDraftAction:vi.fn(),requestAdsReportAction:vi.fn()}));
vi.mock("./WorkspaceShell",()=>({useSalesChannel:()=>({channel:"all"})}));
beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:vi.fn()});
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:vi.fn()});
});
afterEach(()=>{delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;});

it("builds a selected product campaign and requires a separate reviewed create action",async()=>{
  const profile={profileId:"12345",countryCode:"US",currencyCode:"USD",timezone:"America/New_York",accountInfo:{id:"seller",name:"Example seller",type:"seller"}};
  api.accounts.mockResolvedValue({ok:true,result:[profile]});api.workspace.mockResolvedValue({ok:true,result:{profile,campaigns:{campaigns:[]},receipts:[],report:null}});
  let saved:CampaignReceipt;
  api.save.mockImplementation(async(plan:AdsPlan)=>{saved={id:"test-receipt",revision:1,createdAt:"2026-09-10",updatedAt:"2026-09-10",accountKey:"fixture",profile,plan,status:"draft",step:"review",message:"Draft saved",adIds:[],targetIds:[],negativeIds:[],complete:false};return {ok:true,result:saved};});
  api.submit.mockImplementation(async()=>({ok:true,result:{...saved,status:"paused",campaignId:"100",complete:true,message:"Created paused"}}));
  render(<AmazonMarketing connected localProducts={[{id:"amba",name:"Amba sauce"}]}/>);
  fireEvent.click(screen.getByRole("button",{name:"Load advertising accounts"}));await screen.findByRole("option",{name:/Example seller/});
  fireEvent.change(screen.getByLabelText("Advertising account"),{target:{value:"12345"}});await screen.findByText("Your saved work");
  await waitFor(()=>expect(screen.getAllByRole("button",{name:/Create campaign/})[0]).toBeEnabled());
  fireEvent.click(screen.getAllByRole("button",{name:/Create campaign/})[0]);
  fireEvent.change(screen.getByLabelText("Link a workspace product"),{target:{value:"amba"}});
  fireEvent.change(screen.getByLabelText("Amazon ASIN"),{target:{value:"B000000001"}});
  fireEvent.change(screen.getByLabelText(/Amazon seller SKU/),{target:{value:"SELLER-AMBA"}});
  fireEvent.click(screen.getByRole("button",{name:"+ Add this product"}));
  fireEvent.change(screen.getByLabelText("Campaign name"),{target:{value:"Amba discovery"}});
  expect(api.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Save & review campaign →"}));
  await screen.findByText("Saved campaign review");
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({name:"Amba discovery",products:[{name:"Amba sauce",asin:"B000000001",sku:"SELLER-AMBA",localSkuId:"amba"}],dailyBudgetCents:1000,targeting:"AUTO"}),undefined,undefined);
  expect(api.submit).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button",{name:"Create paused campaign in Amazon"}));
  await waitFor(()=>expect(api.submit).toHaveBeenCalledWith("test-receipt",1));
  expect(await screen.findByRole("button",{name:"Review launch →"})).toBeInTheDocument();
});
