package com.ridesharetaxpros.driver.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.plaid.link.Plaid
import com.plaid.link.OpenPlaidLink
import com.plaid.link.configuration.linkTokenConfiguration
import com.plaid.link.result.LinkSuccess
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

@Composable fun BankScreen(repo: DriverRepository,onImport: ()->Unit,onReview: (BankTransaction)->Unit) {
    var linkId by rememberSaveable {mutableStateOf<String?>(null)}; var linkScope by rememberSaveable {mutableStateOf<String?>(null)}
    var connecting by remember {mutableStateOf(false)}; var disconnect by remember {mutableStateOf<BankItem?>(null)}
    var match by remember {mutableStateOf<Pair<BankTransaction,DriverRecord>?>(null)}
    val link=rememberLauncherForActivityResult(OpenPlaidLink()) {result->connecting=false
        if(result is LinkSuccess) repo.run {val connection=repo.connection ?: error("Reconnect your workspace first.");require(linkScope==repo.scope && linkId!=null) {"Your account changed. Open bank linking again."}
            WorkspaceClient(connection).action("banks",mapOf("action" to "exchange","sessionId" to linkId!!,"publicToken" to result.publicToken));linkId=null;repo.refreshBanks()}
        else {linkId=null;repo.failure="Bank linking closed. No bank password is stored by this app."}
    }
    fun connect(item: BankItem?=null) {if(connecting) return;connecting=true;repo.run {try {
        val connection=repo.connection ?: error("Connect your client workspace first."); val scope=repo.scope
        val response=WorkspaceClient(connection).action("banks",mapOf("action" to "link","platform" to "android")+(item?.let {mapOf("itemId" to it.id)} ?: emptyMap()))
        require(repo.scope==scope);linkId=response["sessionId"]!!.jsonPrimitive.content;linkScope=scope
        val configuration=linkTokenConfiguration {token=response["linkToken"]!!.jsonPrimitive.content}
        link.launch(Plaid.createPlaidLinkSession(repo.app,configuration))
    } catch(error: Exception) {connecting=false;throw error}}}
    LaunchedEffect(repo.scope) {repo.run {repo.refreshBanks()}}
    Panel("Connect or import") {
        Text("Review transactions before recording expenses or income. Bank availability and update timing depend on the bank.",color=Muted)
        Text(repo.bankStatus?.reason ?: if(repo.connection==null) "Connect your invited workspace to use bank linking. Statement imports work offline." else "Loading bank connection status…")
        if(repo.bankStatus?.environment=="sandbox") Text("Sandbox banks are test data and cannot be posted to your journal.",color=Muted)
        Button(enabled=repo.bankStatus?.ready==true && !connecting,onClick={connect()}) {Text(if(connecting) "Opening secure bank link…" else "Connect a bank")}
        OutlinedButton(onClick=onImport) {Text("Import CSV, OFX or QFX")}
        OutlinedButton(enabled=repo.connection!=null,onClick={repo.run {repo.refreshBanks()}}) {Text("Refresh transactions")}
        Text("No single connection covers every bank. Export a statement from banks that are unavailable.",color=Muted)
    }
    repo.bankStatus?.items?.forEach {item->Panel(item.label) {Text(if(item.connected==1) "Connected · ${item.environment}" else "Disconnected; imported history retained")
        item.error?.let {Text("Needs attention: $it")}
        if(item.connected==1) {TextButton(onClick={connect(item)},enabled=!connecting) {Text("Reconnect securely")};TextButton(onClick={disconnect=item}) {Text("Disconnect bank")}}
    }}
    if(repo.journal.bankTransactions.isEmpty()) Text("Imported transactions appear here for review.")
    repo.journal.bankTransactions.sortedByDescending {it.date}.take(300).forEach {row->Panel(row.merchant) {
        Text("${row.date} · ${row.currency} ${"%.2f".format(abs(row.amountCents)/100.0)} · ${if(row.amountCents>0) "Outflow" else "Credit"}")
        Text(row.accountLabel,color=Muted)
        Text(when {row.removed->"Removed by bank";row.pending->"Pending · wait for posting";row.needsUpdateReview==true->"Bank details changed: review the linked entry; it has not been overwritten.";row.reviewedRecordId!=null->"Linked to journal";row.ignored==true->"Ignored";row.isTestData==true->"Test transaction";else->"Ready for your review"})
        if(row.ready && row.currency=="USD" && row.isTestData!=true) {
            Button(onClick={onReview(row)}) {Text(if(row.amountCents>0) "Create expense" else "Review as income")}
            val matches=repo.journal.visible.filter {entry->val r=entry.record; r.bankReference==null &&
                (if(row.amountCents>0) r.kind=="expense" && r.expense().amountCents==row.amountCents else r.kind=="income" && r.income().amountCents== -row.amountCents) &&
                abs(ChronoUnit.DAYS.between(LocalDate.parse(row.date),LocalDate.parse(r.date)))<=3}
            matches.take(3).forEach {candidate->OutlinedButton(onClick={match=row to candidate.record}) {Text("Match existing: ${candidate.record.title} · ${candidate.record.date}")}}
        }
        if(row.needsUpdateReview==true) TextButton(onClick={repo.run {repo.update {it.copy(bankTransactions=it.bankTransactions.map {b->if(b.id==row.id) b.copy(needsUpdateReview=false) else b})}}}) {Text("Mark change reviewed")}
        if(row.reviewedRecordId==null) TextButton(onClick={repo.run {repo.update {it.copy(bankTransactions=it.bankTransactions.map {b->if(b.id==row.id) b.copy(ignored=b.ignored!=true) else b})}}}) {Text(if(row.ignored==true) "Restore to review" else "Ignore transaction")}
    }}
    if(repo.journal.bankTransactions.size>300) Text("Showing the latest 300 transactions. Your full inbox is kept on this phone.",color=Muted)
    disconnect?.let {item->AlertDialog(onDismissRequest={disconnect=null},title={Text("Disconnect ${item.label}?")},text={Text("New bank imports will stop. Existing records and source history are kept.")},confirmButton={TextButton(onClick={disconnect=null;repo.run {WorkspaceClient(repo.connection!!).action("banks",mapOf("action" to "disconnect","itemId" to item.id));repo.refreshBanks()}}) {Text("Disconnect")}},dismissButton={TextButton(onClick={disconnect=null}) {Text("Cancel")}})}
    match?.let { (row,record)->AlertDialog(onDismissRequest={match=null},title={Text("Link to this existing entry?")},text={Text("Confirm the date, merchant and amount refer to the same purchase. Its receipt and details will be kept.")},confirmButton={TextButton(onClick={match=null;repo.run {repo.save(if(record.kind=="expense") DriverRecord.expense(record.expense().copy(bankReference=row.reference),record.id,record.revision) else DriverRecord.income(record.income().copy(bankReference=row.reference),record.id,record.revision))}}) {Text("Link entry")}},dismissButton={TextButton(onClick={match=null}) {Text("Cancel")}})}
}

@Composable fun BankImport(repo: DriverRepository,done: ()->Unit) {
    var source by remember {mutableStateOf("")}; var account by remember {mutableStateOf("")}; var ofx by remember {mutableStateOf(false)}
    var headers by remember {mutableStateOf<List<String>>(emptyList())};var columns by remember {mutableStateOf(ColumnMap())};var usd by remember {mutableStateOf(false)}
    var split by remember {mutableStateOf(false)};var preview by remember {mutableStateOf<ImportPreview?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri->if(uri!=null) repo.run {
        source=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,5*1024*1024)}.toString(Charsets.UTF_8)
        ofx=source.contains("<OFX",true);headers=if(ofx) emptyList() else StatementImport.csv(source).first();columns=ColumnMap();preview=null
    }}
    Panel("Statement import") {
        Text("Export CSV, OFX or QFX from your bank. USD is required for journal posting. Imports stay in an inbox until reviewed.")
        Field("Account label (no full account number)",account,{account=it.take(100);preview=null})
        Button(onClick={picker.launch(arrayOf("*/*"))}) {Text("Choose statement file")}
        if(source.isNotEmpty()) Text(if(ofx) "OFX/QFX selected" else "CSV selected · ${headers.size} columns")
        if(headers.isNotEmpty()) {
            val options=linkedMapOf("-1" to "Not used").apply {headers.forEachIndexed {i,label->put(i.toString(),"${i+1}: ${label.take(50)}")}}
            Choice("Date column",columns.date.toString(),options) {columns=columns.copy(date=it.toInt());preview=null}
            Choice("Description column",columns.merchant.toString(),options) {columns=columns.copy(merchant=it.toInt());preview=null}
            Choice("Transaction ID",columns.reference.toString(),options) {columns=columns.copy(reference=it.toInt());preview=null}
            Toggle("Separate debit and credit columns",split) {split=it;preview=null}
            if(split) {Choice("Debit",columns.debit.toString(),options) {columns=columns.copy(debit=it.toInt());preview=null};Choice("Credit",columns.credit.toString(),options) {columns=columns.copy(credit=it.toInt());preview=null}}
            else {Choice("Amount column",columns.amount.toString(),options) {columns=columns.copy(amount=it.toInt());preview=null};Toggle("Positive amounts mean spending",columns.positiveMeansExpense) {columns=columns.copy(positiveMeansExpense=it);preview=null}}
            Choice("Date format",columns.dateFormat,linkedMapOf("yyyy-MM-dd" to "YYYY-MM-DD","M/d/yyyy" to "MM/DD/YYYY","d/M/yyyy" to "DD/MM/YYYY")) {columns=columns.copy(dateFormat=it);preview=null}
            Toggle("I confirm this CSV is in US dollars",usd) {usd=it;preview=null}
        }
        Text("Re-importing the same file is deduplicated. Overlapping files without transaction IDs require manual duplicate review.",color=Muted)
        Button(enabled=source.isNotEmpty() && account.isNotBlank(),onClick={repo.run {preview=if(ofx) StatementImport.ofx(source,account) else StatementImport.previewCSV(source,account,if(split) columns else columns.copy(debit=-1,credit=-1),usd)}}) {Text("Preview import")}
    }
    preview?.let {result->Panel("${result.rows.size} transactions · ${result.issues.size} issues") {
        result.issues.take(10).forEach {Text(it,color=MaterialTheme.colorScheme.error)}
        result.rows.take(12).forEach {Text("${it.date} · ${it.merchant} · ${it.currency} ${it.amountCents/100.0}")}
        Text("Positive = spending; negative = money received. Correct any skipped rows before importing if you need a complete statement.",color=Muted)
        Button(enabled=result.rows.isNotEmpty(),onClick={repo.run {repo.update {it.copy(bankTransactions=mergeBank(it.bankTransactions,result.rows))};done()}}) {Text("Import ${result.rows.size} transactions to review")}
    }}
}
