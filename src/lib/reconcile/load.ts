import { loadLedger } from "../accounting/ledger-load";
import { bankStatements } from "../accounting/bank-store";
import { verifyStatementMatches } from "../accounting/bank-model";
/** Native bank-to-Shuug reconciliation; no external accounting provider. */
export async function loadReconciliation() {
  const ledger=await loadLedger(),statements=bankStatements(),issues=[...ledger.issues];
  for(const statement of statements){try{verifyStatementMatches(statement,ledger.entries);}catch(e){issues.push(`${statement.reference}: ${e instanceof Error?e.message:"Matching needs review."}`);}}
  return { accountingSystem:"Shuug",statements,issues,reviewCount:statements.filter(s=>s.status==="review").length,reconciledCount:statements.filter(s=>s.status==="reconciled").length };
}
