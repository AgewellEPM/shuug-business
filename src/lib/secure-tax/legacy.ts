import type { DatabaseSync } from "node:sqlite";

/** Content-free inventory only. This neither decrypts nor migrates old data.
 * Empty current tables cannot prove that backups, WAL, logs or orphan files are clean. */
export function legacySecureTaxData(db: DatabaseSync, account: { id: string; clientId: string }) {
  const exists = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const count = (table: string, sql: string, ...parameters: string[]) => exists(table) ? Number((db.prepare(sql).get(...parameters) as { n: number }).n) : 0;
  const accounts = "SELECT id FROM customer_accounts WHERE id=? OR clientId=?";
  const counts = {
    driverRecords: count("driver_records", "SELECT count(*) AS n FROM driver_records WHERE accountId=? OR clientId=?", account.id, account.clientId),
    driverMutationCaches: count("driver_mutations", `SELECT count(*) AS n FROM driver_mutations WHERE accountId IN (${accounts})`, account.id, account.clientId),
    coachProfiles: count("driver_coach_profiles", "SELECT count(*) AS n FROM driver_coach_profiles WHERE accountId=? OR clientId=?", account.id, account.clientId),
    coachMessages: count("driver_coach_messages", "SELECT count(*) AS n FROM driver_coach_messages WHERE accountId=? OR clientId=?", account.id, account.clientId),
    coachMutationCaches: count("driver_coach_mutations", "SELECT count(*) AS n FROM driver_coach_mutations WHERE accountId=? OR clientId=?", account.id, account.clientId),
    receiptFiles: count("driver_receipts", `SELECT count(*) AS n FROM driver_receipts WHERE accountId IN (${accounts})`, account.id, account.clientId),
    taxDocuments: count("tax_client_documents", "SELECT count(*) AS n FROM tax_client_documents WHERE accountId=? OR clientId=?", account.id, account.clientId),
    bankProviderAuthorizations: count("driver_bank_items", "SELECT count(*) AS n FROM driver_bank_items WHERE (accountId=? OR clientId=?) AND length(secret)>0", account.id, account.clientId),
    bankPendingRevocations: count("driver_bank_revocations", "SELECT count(*) AS n FROM driver_bank_revocations WHERE (accountId=? OR clientId=?) AND length(accessSecret)>0", account.id, account.clientId),
    bankTransactions: exists("driver_bank_items") ? count("driver_bank_transactions", "SELECT count(*) AS n FROM driver_bank_transactions t JOIN driver_bank_items i ON i.id=t.itemId WHERE i.accountId=? OR i.clientId=?", account.id, account.clientId) : 0,
    uberProviderAuthorizations: count("gig_uber_links", "SELECT count(*) AS n FROM gig_uber_links WHERE (accountId=? OR clientId=?) AND secrets IS NOT NULL AND length(secrets)>0", account.id, account.clientId),
    uberProfiles: count("gig_uber_links", "SELECT count(*) AS n FROM gig_uber_links WHERE (accountId=? OR clientId=?) AND profile IS NOT NULL AND length(profile)>0", account.id, account.clientId),
    uberSourceFacts: count("gig_uber_facts", "SELECT count(*) AS n FROM gig_uber_facts WHERE accountId=? OR clientId=?", account.id, account.clientId),
    uberAuthorizationStates: count("gig_uber_states", "SELECT count(*) AS n FROM gig_uber_states WHERE accountId=? OR clientId=?", account.id, account.clientId),
    sdkTaxRecords: 0,
    taxOfficeWorkflows: count("documents", "SELECT count(*) AS n FROM documents WHERE kind='tax-workflow' AND json_extract(body,'$.clientId')=?", account.clientId),
    clientBooks: 0,
    clientBookJournals: 0,
    clientBookBilling: 0,
    clientBookBankStatements: 0,
    clientBookShares: 0,
    accountIdentityProfiles: count("customer_accounts", "SELECT count(*) AS n FROM customer_accounts WHERE (id=? OR clientId=?) AND (length(name)>0 OR length(email)>0)", account.id, account.clientId),
    serviceClientProfiles: count("records", "SELECT count(*) AS n FROM records WHERE kind='client' AND id=?", account.clientId),
  };
  const books = (db.prepare("SELECT body FROM documents WHERE kind='client-book' AND json_extract(body,'$.clientId')=?").all(account.clientId) as {body:string}[]).map(r=>JSON.parse(r.body) as {id:string});
  counts.clientBooks = books.length;
  for (const book of books) {
    const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='state'").get(`state:client-journal:${book.id}`) as {body:string}|undefined;
    if(row) { const value=JSON.parse(row.body); counts.clientBookJournals+=(value.entries??[]).length; counts.clientBookBilling+=(value.billing??[]).length; counts.clientBookBankStatements+=(value.bank?.statements??[]).length; }
    counts.clientBookShares+=count("documents","SELECT count(*) AS n FROM documents WHERE kind='billing-share' AND json_extract(body,'$.bookId')=?",book.id);
  }
  const modules = db.prepare("SELECT body FROM documents WHERE id='state:module-records' AND kind='state'").get() as { body: string } | undefined;
  if (modules) {
    const value = JSON.parse(modules.body) as Record<string, { values?: { client_id?: unknown } }[]>;
    counts.sdkTaxRecords = ["tax-engagements", "tax-document-requests", "tax-filing-handoffs", "rideshare-tax-records", "tax-quarterly-reviews"]
      .reduce((sum, module) => sum + (value[module] ?? []).filter(row => row.values?.client_id === account.clientId).length, 0);
  }
  return { legacyMigrationRequired: Object.values(counts).some(value => value > 0),
    legacyProviderAuthorizationPresent: counts.bankProviderAuthorizations + counts.bankPendingRevocations + counts.uberProviderAuthorizations > 0,
    legacyCounts: counts, plaintextMigrationPerformed: false,
    migrationVerificationRequired: true, hostCompromiseProtectionVerified: false, backupAndHistoryReviewRequired: true,
    legacyScanScope: "Current account and linked client's known live database rows only. Filesystem history, orphan files, WAL, logs, prior exports and backups require a separate trusted migration audit." };
}
