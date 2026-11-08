package com.ridesharetaxpros.driver.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository

@Composable fun MoneyDetailScreen(repo:DriverRepository,id:String,navigate:(String)->Unit,done:()->Unit) {
    val entry=repo.journal.visible.firstOrNull {it.record.id==id && it.record.kind in setOf("expense","income")}
    var deleting by remember {mutableStateOf(false)}
    var preview by remember(repo.scope) {mutableStateOf<DocumentPreviewData?>(null)}
    var loading by remember {mutableStateOf(false)}
    if(entry==null) {Panel("Record unavailable") {Text("This record is no longer in the current account’s journal.",color=Muted)};return}
    val record=entry.record
    Panel(record.title) {
        if(record.kind=="expense") {
            val expense=record.expense()
            Text(usd(expense.amountCents),fontSize=34.sp,fontWeight=FontWeight.Bold,color=ExpenseColor)
            Text("Date: ${expense.date}");Text("Category: ${expenseCategories[expense.category] ?: expense.category}")
            Text("Classification: ${classifications[expense.classification] ?: expense.classification}")
            expense.businessPurpose?.takeIf {it.isNotBlank()}?.let {Text("Business purpose: $it")}
            expense.businessUsePercent?.let {Text("Recorded business use: $it%")}
            expense.mealContext?.takeIf {it.isNotBlank()}?.let {Text("Meal / travel context: $it")}
            expense.vehicle?.takeIf {it.isNotBlank()}?.let {Text("Vehicle: $it")}
            expense.odometerMiles?.let {Text("Odometer: $it mi")}
            expense.paymentMethod?.let {Text("Paid using: ${mapOf("cash" to "Cash","card" to "Card","bank" to "Bank transfer","platform" to "Deducted from payout","other" to "Other")[it] ?: it}")}
            expense.place?.takeIf {it.isNotBlank()}?.let {Text("Place: $it")}
            if(expense.notes.isNotBlank())Text(expense.notes)
            expense.receiptId?.let {receipt->
                val scope=repo.scope
                Action(if(loading) "Opening private receipt…" else "View private receipt",{loading=true;repo.run {try {
                    val bytes=repo.receipt(receipt);check(scope==repo.scope) {"Your account changed. Open this receipt again."}
                    val mime=validatedDocumentMime(bytes,repo.journal.receipts.firstOrNull {it.id==receipt}?.mime)
                    preview=DocumentPreviewData("Receipt-${receipt.take(8)}.${if(mime=="application/pdf") "pdf" else if(mime=="image/png") "png" else "jpg"}",bytes,mime)
                } finally {loading=false}}},false,!loading)
            }
        } else {
            val income=record.income();Text(usd(income.amountCents),fontSize=34.sp,fontWeight=FontWeight.Bold,color=Income)
            Text("Date: ${income.date}");Text("Platform: ${income.platform.replaceFirstChar {it.uppercase()}}")
            if(income.notes.isNotBlank())Text(income.notes)
        }
        Text(if(entry.conflict!=null) "Review sync conflict" else if(entry.pendingMutationId!=null) "Saved on phone · Sync pending" else "Synced to your firm",color=if(entry.conflict!=null) Danger else Link)
        record.bankReference?.let {bank->Text("Bank source: ${bank.accountLabel}",color=Muted);Text("Linked transaction: ${bank.transactionId}",color=Muted)}
    }
    entry.conflict?.let {remote->Panel("Choose the version to keep") {
        Text("This record changed on another device. Your phone copy has not overwritten it.",color=Muted)
        Text("Workspace: ${remote.record.title} · Updated ${remote.updatedAt}")
        if(remote.record.deleted)Text("Deleted in the workspace",color=Caution)
        Text(remote.record.body.toString(),color=Muted)
        Action("Keep phone version",{repo.run {repo.resolve(id,true);repo.sync()}},false)
        Action("Use workspace version",{repo.run {repo.resolve(id,false);repo.sync()}},false)
    }}
    if(record.kind=="expense") record.expense().reviewNotes().takeIf {it.isNotEmpty()}?.let {notes->Panel("Details to review") {
        notes.forEach {Text(it)}
        Text("These are recordkeeping prompts; missing a receipt does not determine deductibility.",color=Muted)
    }}
    Action("Edit record",{navigate("Edit:$id")},false)
    TextButton(onClick={deleting=true}) {Text("Delete record",color=Danger)}
    if(deleting) AlertDialog(onDismissRequest={deleting=false},title={Text("Delete this record?")},text={Text("This deletes the record from your journal and syncs that deletion to your firm. Source attachments remain available for recovery.")},
        confirmButton={TextButton(onClick={deleting=false;repo.run {repo.save(record.copy(deleted=true));done()}}) {Text("Delete record",color=Danger)}},dismissButton={TextButton(onClick={deleting=false}) {Text("Keep record")}})
    preview?.let {NativeDocumentPreview(repo,it) {preview=null}}
}
