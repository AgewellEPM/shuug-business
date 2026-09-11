import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TrackerWorkspace } from "./TrackerWorkspace";
import type { Tracker } from "@/lib/features/model";
const mocks=vi.hoisted(()=>({save:vi.fn(),archive:vi.fn(),refresh:vi.fn(),channel:"all"}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("./WorkspaceShell",()=>({useSalesChannel:()=>({channel:mocks.channel})}));
vi.mock("@/app/features/actions",()=>({saveTrackerRecordAction:mocks.save,archiveTrackerRecordAction:mocks.archive,setToolVisibilityAction:vi.fn()}));
const tracker:Tracker={id:"a455bbfe-2af5-4aac-a55a-6207ee3ab98f",name:"Test deliveries",description:"Track deliveries",enabled:true,templateId:null,createdAt:"2026-09-09T00:00:00.000Z",fields:[{id:"company",label:"Business",type:"text",required:true,options:[]},{id:"amount",label:"Amount",type:"money",required:false,options:[]}],records:[]};
beforeEach(()=>{vi.clearAllMocks();mocks.channel="all";});
it("submits the visible form values and selected sales channel, then shows the saved record",async()=>{
  mocks.save.mockImplementation(async(_id,input)=>({ok:true,result:{...tracker,records:[{...input,revision:1,archived:false,createdAt:tracker.createdAt,updatedAt:tracker.createdAt}]}}));
  render(<TrackerWorkspace initial={tracker}/>);
  fireEvent.click(screen.getByRole("button",{name:"+ Add first record"}));
  fireEvent.change(screen.getByLabelText(/Business/),{target:{value:"Test Market"}});
  fireEvent.change(screen.getByLabelText("Amount"),{target:{value:"12.50"}});
  fireEvent.change(screen.getByLabelText("Sales channel"),{target:{value:"bulk"}});
  fireEvent.click(screen.getByRole("button",{name:"Save record"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(tracker.id,expect.objectContaining({channel:"bulk",revision:0,values:{company:"Test Market",amount:12.5}})));
  expect(await screen.findByText("Test Market")).toBeInTheDocument();expect(screen.getByText("Record saved.")).toBeInTheDocument();
});
it("keeps an unsaved edit visible after a conflicting save",async()=>{
  mocks.save.mockResolvedValue({ok:false,error:"This record changed in another tab. Reload before saving."});
  render(<TrackerWorkspace initial={tracker}/>);fireEvent.click(screen.getByRole("button",{name:"+ Add record"}));
  fireEvent.change(screen.getByLabelText(/Business/),{target:{value:"Keep my edit"}});fireEvent.click(screen.getByRole("button",{name:"Save record"}));
  expect(await screen.findByText(/This record changed/)).toBeInTheDocument();expect(screen.getByLabelText(/Business/)).toHaveValue("Keep my edit");
});
it("filters records by the workspace channel",()=>{
  mocks.channel="bulk";const record={id:"r1",revision:1,archived:false,createdAt:tracker.createdAt,updatedAt:tracker.createdAt};
  render(<TrackerWorkspace initial={{...tracker,records:[{...record,channel:"stores",values:{company:"Store only"}},{...record,id:"r2",channel:"bulk",values:{company:"Bulk only"}}]}}/>);
  expect(screen.getByText("Bulk only")).toBeInTheDocument();expect(screen.queryByText("Store only")).not.toBeInTheDocument();
});
