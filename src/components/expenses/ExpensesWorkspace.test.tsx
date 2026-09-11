import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,expect,it,vi } from "vitest";
import { ExpensesWorkspace } from "./ExpensesWorkspace";
import { blankExpense, type Expense } from "@/lib/expenses/model";
const api=vi.hoisted(()=>({save:vi.fn(),archive:vi.fn(),refresh:vi.fn()}));
vi.mock("@/app/expenses/actions",()=>({saveExpenseAction:api.save,archiveExpenseAction:api.archive,refreshExpensesAction:api.refresh}));
vi.mock("../WorkspaceShell",()=>({useSalesChannel:()=>({channel:"all"})}));
beforeEach(()=>vi.clearAllMocks());
const expense:Expense={id:"receipt-fixture",revision:1,createdAt:"2026-09-10",updatedAt:"2026-09-10",status:"draft",fields:{...blankExpense("2026-09-10"),merchant:"Office fixture",amountCents:10825,taxCents:825},receipt:{name:"fixture.png",hash:"fixture",extension:"png",mime:"image/png",bytes:100,text:"Fixture pencils",extraction:"read",message:"Suggested details need your review."},history:[]};
it("requires review before receipt totals are recorded and sends exact cents",async()=>{
  api.save.mockResolvedValue({ok:true,expense:{...expense,status:"recorded",revision:2},duplicate:null});
  render(<ExpensesWorkspace canEdit initial={[expense]} today="2026-09-10"/>);
  expect(api.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Review →"}));
  expect(screen.getByRole("link",{name:"Download original"})).toHaveAttribute("href","/api/receipts/receipt-fixture?download=1");
  expect(screen.getByLabelText("Receipt total (including tax)")).toHaveValue("108.25");
  fireEvent.change(screen.getByLabelText("Business purpose / notes"),{target:{value:"Buyer meeting supplies"}});
  fireEvent.click(screen.getByRole("button",{name:"Record expense"}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledWith(expect.objectContaining({id:expense.id,revision:1,status:"recorded",fields:expect.objectContaining({amountCents:10825,taxCents:825,notes:"Buyer meeting supplies"})})));
  expect(await screen.findByRole("button",{name:"Save changes"})).toBeInTheDocument();
});
it("searches extracted text and preserves edits when a save fails",async()=>{
  api.save.mockResolvedValue({ok:false,error:"This expense changed. Reload it before saving."});render(<ExpensesWorkspace canEdit initial={[expense]} today="2026-09-10"/>);
  fireEvent.change(screen.getByLabelText("Search receipts"),{target:{value:"pencils"}});expect(screen.getByRole("button",{name:"Office fixture"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Review →"}));fireEvent.change(screen.getByLabelText("Merchant / business"),{target:{value:"Edited vendor"}});fireEvent.click(screen.getByRole("button",{name:"Record expense"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("This expense changed");expect(screen.getByLabelText("Merchant / business")).toHaveValue("Edited vendor");
});
