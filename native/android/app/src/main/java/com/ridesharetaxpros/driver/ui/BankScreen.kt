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
import java.util.Locale

@Composable fun BankScreen(repo: DriverRepository,onImport: ()->Unit,onReview: (BankTransaction)->Unit,onOpenRecord: ((String)->Unit)?=null) {
    val accountScope=repo.scope
    var showAll by rememberSaveable(accountScope) {mutableStateOf(false)}
    var limit by remember(accountScope,showAll) {mutableIntStateOf(100)}
    var linkId by rememberSaveable {mutableStateOf<String?>(null)}; var linkScope by rememberSaveable {mutableStateOf<String?>(null)}
    var connecting by remember(accountScope) {mutableStateOf(false)}; var disconnect by remember(accountScope) {mutableStateOf<BankItem?>(null)}
    var match by remember(accountScope) {mutableStateOf<Pair<BankTransaction,DriverRecord>?>(null)}
    var notice by remember(accountScope) {mutableStateOf<String?>(null)}
    fun cancelPending() {
        val session=linkId;val expected=linkScope;val connection=repo.connection;linkId=null;linkScope=null
        if(session!=null && connection!=null && expected==repo.scope)repo.run {
            WorkspaceClient(connection).action("banks",mapOf("action" to "cancel","sessionId" to session))
        }
    }
    val link=rememberLauncherForActivityResult(OpenPlaidLink()) {result->connecting=false
        if(result is LinkSuccess) repo.run {val connection=repo.connection ?: error("Reconnect your workspace first.");require(linkScope==repo.scope && linkId!=null) {"Your account changed. Open bank linking again."}
            WorkspaceClient(connection).action("banks",mapOf("action" to "exchange","sessionId" to linkId!!,"publicToken" to result.publicToken));linkId=null;repo.refreshBanks()}
        else {cancelPending();notice="Bank linking closed. No bank password is stored by this app."}
    }
    fun connect(item: BankItem?=null) {if(connecting) return;connecting=true;repo.run {try {
        val connection=repo.connection ?: error("Connect your client workspace first."); val scope=repo.scope
        val response=WorkspaceClient(connection).action("banks",mapOf("action" to "link","platform" to "android")+(item?.let {mapOf("itemId" to it.id)} ?: emptyMap()))
        require(repo.scope==scope);linkId=response["sessionId"]!!.jsonPrimitive.content;linkScope=scope
        val configuration=linkTokenConfiguration {token=response["linkToken"]!!.jsonPrimitive.content}
        link.launch(Plaid.createPlaidLinkSession(repo.app,configuration))
    } catch(error: Exception) {connecting=false;cancelPending();throw error}}}
    LaunchedEffect(repo.scope) {repo.run {repo.refreshBanks()}}
    Panel("Connect or import") {
        Text("Review transactions before recording expenses or income. Bank availability and update timing depend on the bank.",color=Muted)
        Text(repo.bankStatus?.reason ?: if(repo.connection==null) "Connect your invited workspace to use bank linking. Statement imports work offline." else "Loading bank connection status…")
        notice?.let {Text(it,color=Muted)}
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
    Toggle("Show reviewed, pending & ignored",showAll,{showAll=it})
    val transactions=repo.journal.bankTransactions.filter {showAll || it.ready || it.needsUpdateReview==true}.sortedByDescending {it.date}
    val candidates=remember(repo.journal.entries) {repo.journal.visible.map {it.record}.filter {it.kind in setOf("expense","income") && it.bankReference==null}
        .groupBy {record->if(record.kind=="expense") record.expense().let {Triple("expense",it.currency,it.amountCents)} else record.income().let {Triple("income",it.currency,it.amountCents)}}}
    if(transactions.isEmpty()) Panel("No transactions to review") {Text("Import a statement or connect an available bank. Nothing is labeled as business automatically.",color=Muted)}
    transactions.take(limit).forEach {row->Panel(row.merchant) {
        Text("${row.date} · ${row.currency} ${"%.2f".format(Locale.US,abs(row.amountCents.toLong())/100.0)} · ${if(row.amountCents>0) "Spending" else "Received"}")
        Text(row.accountLabel,color=Muted)
        Text(when {row.needsUpdateReview==true->"Bank details changed—review saved record";row.pending->"Pending—wait for posting";row.removed->"Removed by bank";row.reviewedRecordId!=null->"Linked to journal";row.ignored==true->"Ignored / personal";row.isTestData==true->"Sandbox test transaction";else->"Ready for your review"})
        row.suggestedCategory?.let {Text("Suggested: ${expenseCategories[it] ?: it}",color=Link)}
        if(row.pending) Text("Its amount or merchant can change; wait for the posted transaction.",color=Muted)
        if(row.removed) Text("Your bank removed this transaction. Review any linked journal record; the app has not deleted it.",color=Muted)
        if(row.isTestData==true) Text("This test transaction cannot be posted to your real journal.",color=Caution)
        if(row.reviewedRecordId!=null) {
            onOpenRecord?.let {open->Action("Open saved record",{open(row.reviewedRecordId)},primary=false)}
            if(row.needsUpdateReview==true) {
                Text("Compare these updated bank details with your saved entry. Corrections are never silently posted.",color=Muted)
                TextButton(onClick={repo.run {require(repo.scope==accountScope) {"Your account changed. Reopen bank review."};repo.update {it.copy(bankTransactions=it.bankTransactions.map {b->if(b.id==row.id) b.copy(needsUpdateReview=false) else b})}}}) {Text("I reviewed this bank update")}
            }
        } else if(row.ready && row.currency=="USD" && row.isTestData!=true) {
            if(row.amountCents<0) Text("Money received can be earnings, a refund or a transfer. Record business receipts only when appropriate; ignore transfers between your own accounts.",color=Muted)
            Button(onClick={onReview(row)}) {Text(if(row.amountCents>0) "Create expense from this transaction" else "Record business income / receipt")}
            val key=Triple(if(row.amountCents>0) "expense" else "income",row.currency,abs(row.amountCents))
            val matches=candidates[key].orEmpty().filter {record->runCatching {abs(ChronoUnit.DAYS.between(LocalDate.parse(row.date),LocalDate.parse(record.date)))<=3}.getOrDefault(false)}
            if(matches.isNotEmpty()) Text("Possible existing records · Same amount within three days. Confirm a match to keep its receipt and avoid another entry.",color=Muted)
            matches.forEach {candidate->OutlinedButton(onClick={match=row to candidate}) {Text("Match: ${candidate.title} · ${candidate.date}")}}
        }
        if(row.reviewedRecordId==null) TextButton(onClick={repo.run {require(repo.scope==accountScope) {"Your account changed. Reopen bank review."};repo.update {it.copy(bankTransactions=it.bankTransactions.map {b->if(b.id==row.id) b.copy(ignored=b.ignored!=true) else b})}}}) {Text(if(row.ignored==true) "Return to review" else "Ignore / personal / transfer")}
    }}
    if(transactions.isNotEmpty()) Text("Showing ${minOf(limit,transactions.size)} of ${transactions.size} transactions",color=Muted)
    if(transactions.size>limit) Action("Show more transactions",{limit=(limit+100).coerceAtMost(transactions.size)},primary=false)
    disconnect?.let {item->AlertDialog(onDismissRequest={disconnect=null},title={Text("Disconnect ${item.label}?")},text={Text("New bank imports will stop. Existing records and source history are kept.")},confirmButton={TextButton(onClick={disconnect=null;repo.run {require(repo.scope==accountScope) {"Your account changed. Reopen bank review."};val connection=repo.connection ?: error("Reconnect your workspace first.");WorkspaceClient(connection).action("banks",mapOf("action" to "disconnect","itemId" to item.id));if(repo.scope==accountScope) repo.refreshBanks()}}) {Text("Disconnect")}},dismissButton={TextButton(onClick={disconnect=null}) {Text("Cancel")}})}
    match?.let { (row,record)->AlertDialog(onDismissRequest={match=null},title={Text("Link to this existing entry?")},text={Text("Confirm the date, merchant and amount refer to the same purchase. Its receipt and details will be kept.")},confirmButton={TextButton(onClick={match=null;repo.run {require(repo.scope==accountScope) {"Your account changed. Reopen bank review."}
            val current=repo.journal.bankTransactions.firstOrNull {it.id==row.id} ?: error("This transaction is no longer available.")
            require(current.ready && current.currency=="USD" && current.isTestData!=true && current.amountCents==row.amountCents && current.date==row.date && current.merchant==row.merchant) {"The bank details changed. Review this transaction again."}
            val saved=repo.journal.visible.firstOrNull {it.record.id==record.id}?.record
            require(saved!=null && saved==record && saved.bankReference==null) {"The saved entry changed. Review the possible match again."}
            repo.save(if(record.kind=="expense") DriverRecord.expense(record.expense().copy(bankReference=current.reference),record.id,record.revision) else DriverRecord.income(record.income().copy(bankReference=current.reference),record.id,record.revision))}}) {Text("Link entry")}},dismissButton={TextButton(onClick={match=null}) {Text("Cancel")}})}
}

@Composable fun BankImport(repo: DriverRepository,done: ()->Unit) {
    var source by remember {mutableStateOf("")}; var account by remember {mutableStateOf("")}; var ofx by remember {mutableStateOf(false)}
    var headers by remember {mutableStateOf<List<String>>(emptyList())};var columns by remember {mutableStateOf(ColumnMap())};var usd by remember {mutableStateOf(false)}
    var split by remember {mutableStateOf(false)};var preview by remember {mutableStateOf<ImportPreview?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri->if(uri!=null) repo.run {
        source=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,5*1024*1024)}.toString(Charsets.UTF_8)
        ofx=source.contains("<OFX",true);headers=if(ofx) emptyList() else StatementImport.csv(source).firstOrNull() ?: error("This statement has no readable CSV rows.");columns=ColumnMap();preview=null
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
