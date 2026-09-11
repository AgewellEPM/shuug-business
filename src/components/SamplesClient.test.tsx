import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { SamplesClient } from "./SamplesClient";
it("submits store, contact, phone and delivery address and displays them in the approval queue",async()=>{
  const create=vi.fn(async()=>({ok:true,message:"Saved"}));
  render(<SamplesClient skus={[{id:"amba",name:"Amba"}]} samples={[{id:"sample",requesterName:"Pat Buyer",company:"Example deli",email:"buyer@example.com",phone:"+1 413 555 0100",shippingAddress:"1 Example St\nSpringfield, MA 01103",note:"",lines:[],status:"pending",createdAt:"2026-09-10",decidedBy:null,shipmentId:null}]} createAction={create} decideAction={vi.fn()}/>);
  expect(screen.getByRole("link",{name:"+1 413 555 0100"})).toHaveAttribute("href","tel:+14135550100");expect(screen.getByText(/1 Example St/)).toBeInTheDocument();
  for(const [label,value] of [["Store / company requesting","New market"],["Contact name","New Buyer"],["Phone number","413 555 0101"],["Email","new@example.com"],["Shipping address","2 Example St, Springfield, MA 01103"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.change(screen.getByLabelText("Amba"),{target:{value:"1"}});fireEvent.click(screen.getByRole("button",{name:"Submit for approval"}));
  await waitFor(()=>expect(create).toHaveBeenCalledWith(expect.objectContaining({company:"New market",requesterName:"New Buyer",phone:"413 555 0101",shippingAddress:"2 Example St, Springfield, MA 01103",lines:[{skuId:"amba",cases:1}]})));
});
