import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { listExpenses } from "@/lib/expenses/store";
import { businessDay } from "@/lib/history/dates";
import { ExpensesWorkspace } from "@/components/expenses/ExpensesWorkspace";
import { chartOfAccounts } from "@/lib/accounting/journal-store";
export const dynamic="force-dynamic";
export default async function ExpensesPage() {
  await requireSectionAccess("money", "view");

  await requireWorkspaceAccess();
  let canEdit=false;try{await requireSectionAccess("money","edit");canEdit=true;}catch{}
  return <ExpensesWorkspace initial={listExpenses()} today={businessDay(new Date().toISOString())} canEdit={canEdit} accounts={chartOfAccounts().accounts}/>;
}
