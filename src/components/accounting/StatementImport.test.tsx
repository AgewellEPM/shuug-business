import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {StatementImport} from "../AccountingWorkspace";
import {standardAccounts} from "@/lib/accounting/account-model";
it("requires a matching preview and re-preview after any statement details change",async()=>{
  const send=vi.fn(async()=>{}),data={accounts:standardAccounts(),entries:[],statements:[]} as unknown as Parameters<typeof StatementImport>[0]["data"];
  render(<StatementImport data={data} send={send}/>);fireEvent.click(screen.getByText("Import a bank statement"));
  for(const [label,value] of [["Statement start","2026-10-01"],["Statement end","2026-10-31"],["Ending balance USD","100.00"],["Statement reference","Synthetic October"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.change(screen.getByLabelText("CSV preview"),{target:{value:"date,description,amount,reference\n2026-10-02,Sale,100.00,bank1"}});
  fireEvent.click(screen.getByRole("button",{name:"Preview mapped transactions"}));expect(screen.getByRole("status").textContent).toContain("1 transactions");
  fireEvent.change(screen.getByLabelText("Statement reference"),{target:{value:"Corrected reference"}});
  fireEvent.click(screen.getByLabelText("I reviewed these details."));
  fireEvent.submit(screen.getByRole("button",{name:"Import for review"}).closest("form")!);
  await screen.findByText(/Changes require a new preview/);expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Preview mapped transactions"}));
  fireEvent.submit(screen.getByRole("button",{name:"Import for review"}).closest("form")!);
  await waitFor(()=>expect(send).toHaveBeenCalledOnce());
  expect(send).toHaveBeenCalledWith("statement.import",expect.objectContaining({reference:"Corrected reference",closingCents:10000,reviewed:true}));
});
