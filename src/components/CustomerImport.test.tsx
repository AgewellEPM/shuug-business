import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { CustomerImport } from "./CustomerImport";
import { mapCustomerRows, type ImportPreview } from "@/lib/customers/import-model";

const actions=vi.hoisted(()=>({file:vi.fn(),qbo:vi.fn(),commit:vi.fn(),refresh:vi.fn()}));
vi.mock("@/app/customers/import/actions",()=>({previewFileCustomersAction:actions.file,previewQuickBooksCustomersAction:actions.qbo,commitCustomersAction:actions.commit}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:actions.refresh})}));
const rows=[{Company:"Example deli",Email:"buyer@example.com",Phone:"012345"},{Company:"Example market",Email:"market@example.com",Phone:"987654"}];
const preview:ImportPreview={id:"review",source:"QuickBooks",createdAt:"2026-09-10",count:2,rows:mapCustomerRows(rows,{company:"Company",buyerEmail:"Email",phone:"Phone"},"store")};
beforeEach(()=>{vi.clearAllMocks();actions.qbo.mockResolvedValue({ok:true,result:preview});actions.commit.mockResolvedValue({ok:true,result:{imported:1,skipped:0,results:[{index:0,customerId:"new",message:"Imported."}]}});});

it("requires review and imports only selected QuickBooks contacts",async()=>{
  render(<CustomerImport quickbooksConnected/>);
  fireEvent.click(screen.getByRole("button",{name:"Preview QuickBooks customers"}));
  await screen.findByLabelText("Import row 2");
  expect(actions.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Import row 3"));
  fireEvent.click(screen.getByRole("button",{name:"Import 1 customers"}));
  await waitFor(()=>expect(actions.commit).toHaveBeenCalledWith("review",[0]));
  expect(await screen.findByText(/1 customers imported/)).toBeInTheDocument();
});

it("opens a real Excel workbook, matches its headers and preserves phone text",async()=>{
  actions.file.mockImplementation(async(data,mapping,channel)=>({ok:true,result:{...preview,source:"Spreadsheet",rows:mapCustomerRows(data,mapping,channel)}}));
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),"Customers");
  const bytes=XLSX.write(book,{type:"array",bookType:"xlsx"});
  const file=new File([bytes],"customers.xlsx");Object.defineProperty(file,"arrayBuffer",{value:async()=>bytes});
  render(<CustomerImport quickbooksConnected={false}/>);
  fireEvent.change(screen.getByLabelText("Choose customer spreadsheet"),{target:{files:[file]}});
  await screen.findByText("Match your columns");
  fireEvent.click(screen.getByRole("button",{name:"Review customers →"}));
  await screen.findByLabelText("Import row 2");
  expect(actions.file).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({Phone:"012345"})]),expect.objectContaining({company:"Company",buyerEmail:"Email",phone:"Phone"}),"store");
  expect(actions.commit).not.toHaveBeenCalled();
});
