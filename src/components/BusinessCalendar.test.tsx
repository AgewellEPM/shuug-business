import { fireEvent,render,screen } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { BusinessCalendar } from "./BusinessCalendar";
import type { BusinessHistory } from "@/lib/history/model";
vi.mock("@/app/calendar/actions",()=>({addBusinessActivityAction:vi.fn(),refreshBusinessHistoryAction:vi.fn()}));
vi.mock("./WorkspaceShell",()=>({useSalesChannel:()=>({channel:"all"})}));
const data:BusinessHistory={today:"2026-09-10",timezone:"America/New_York",durableOrders:true,expenses:[],sales:[{id:"fixture-order",date:"2026-09-09",customer:"Green Market",channel:"stores",status:"submitted",revenueCents:10000,costCents:4000,estimated:false,products:[{id:"sauce",name:"Sauce",quantity:2,unit:"case",revenueCents:10000,costCents:4000,estimated:false}]}],activities:[{id:"visit",date:"2026-09-09",title:"Buyer meeting",detail:"Discussed fall promotion",kind:"Visit",channel:"stores",href:"/calendar",source:"saved"}]};
it("drills from a month into day history and from a year back to a month",()=>{
  render(<BusinessCalendar initial={data} initialDate="2026-09-10" initialView="month"/>);
  fireEvent.click(screen.getByRole("button",{name:/View 2026-09-09:/}));expect(screen.getByText("Buyer meeting")).toBeInTheDocument();expect(screen.getByText("Green Market")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Expand day →"}));expect(screen.getByRole("button",{name:"day"})).toHaveAttribute("aria-pressed","true");
  fireEvent.click(screen.getByRole("button",{name:"year"}));fireEvent.click(screen.getByRole("button",{name:"Open September 2026"}));expect(screen.getByRole("button",{name:"month"})).toHaveAttribute("aria-pressed","true");expect(screen.getByLabelText("Browse date")).toHaveValue("2026-09-01");
});
