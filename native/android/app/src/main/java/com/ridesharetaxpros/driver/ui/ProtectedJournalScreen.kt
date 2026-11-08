package com.ridesharetaxpros.driver.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@Composable fun ProtectedJournalScreen(repo:DriverRepository) {
    val connection=repo.connection;val namespace=repo.scope;val identity=namespace+"|"+(connection?.session?.token ?: "signed-out")
    var service by remember(identity) { mutableStateOf<ProtectedJournalService?>(null) }
    var checkpoint by remember(identity) { mutableStateOf<ProtectedJournalCheckpoint?>(null) }
    var rows by remember(identity) { mutableStateOf<List<ProtectedObjectReceipt>>(emptyList()) }
    var cursor by remember(identity) { mutableStateOf(0L) };var hasMore by remember(identity) { mutableStateOf(false) }
    var preview by remember(identity) { mutableStateOf<ProtectedJournalSnapshot?>(null) }
    var review by remember(identity) { mutableStateOf<ProtectedJournalImportReview?>(null) }
    var expanded by remember(identity) { mutableStateOf(false) }
    var busy by remember(identity) { mutableStateOf(false) };var loading by remember(identity) { mutableStateOf(false) }
    var notice by remember(identity) { mutableStateOf<String?>(null) };var error by remember(identity) { mutableStateOf<String?>(null) }
    var deleting by remember(identity) { mutableStateOf(false) }
    val jobs=rememberCoroutineScope()
    fun current()=repo.scope==namespace && repo.connection==connection
    suspend fun configure() {
        if(connection==null) { error="Connect your invited client account before opening Protected Journal.";return }
        loading=true;error=null;service=null
        try {
            val next=ProtectedJournalService.configure(repo)
            if(current()) { service=next;checkpoint=next.checkpoint() }
        } catch(failure:Exception) {
            if(failure is CancellationException) throw failure
            if(current()) error=if(failure is java.io.FileNotFoundException) "Protected Journal is unavailable until your firm’s public signing and recovery keys are included in this signed app." else failure.message ?: "The protected workspace could not be verified. Your local Journal is kept."
        } finally { if(current()) loading=false }
    }
    fun work(block:suspend (ProtectedJournalService)->Unit) {
        val adapter=service ?: return;if(busy || loading || !current()) return
        busy=true;error=null
        jobs.launch {
            try { block(adapter) }
            catch(failure:Exception) {
                if(failure is CancellationException) throw failure
                if(current()) { error=failure.message ?: "The encrypted operation was not confirmed. Keep the local Journal and retry.";checkpoint=runCatching { adapter.checkpoint() }.getOrNull() }
            } finally { if(current()) busy=false }
        }
    }
    LaunchedEffect(identity) { configure() }
    Panel("Encrypted Journal snapshots") {
        Text("Save this account’s durable Journal as a client-encrypted snapshot for review in an approved client. This does not replace normal records or migrate older workspace data.")
        Text("Includes trips, income, expenses, offers, decisions, goals, mission and review/settings history. Historical route files, receipt contents and server-only tax/profile/provider data are separate and are not uploaded here.",color=Muted,style=MaterialTheme.typography.bodySmall)
        if(loading) { CircularProgressIndicator(color=Link);Text("Checking protected workspace…",color=Muted) }
        if(busy) LinearProgressIndicator(Modifier.fillMaxWidth(),color=Route)
        notice?.let { Text(it,color=Income) };error?.let { Text(it,color=Link) }
    }
    Panel("This phone’s archive") {
        checkpoint?.let { saved->
            Text("Remote revision: ${saved.revision}")
            if(saved.pending!=null) Text("An encrypted upload is waiting for confirmation. Retry sends its original ciphertext first; later edits stay pending.",color=Caution,style=MaterialTheme.typography.bodySmall)
            if(saved.deleted) {
                Text("This remote archive was deleted. Your local Journal and attachments are kept.",color=Muted)
                Action("Start a new archive with a new ID",{work { adapter->adapter.startNewArchive();if(current()) { checkpoint=adapter.checkpoint();notice="A new opaque archive ID is ready for your next explicit upload." } }},false,!busy && !loading && service!=null)
            }
        }
        Box(Modifier.testTag("secureTax.uploadSnapshot")) { Action("Upload encrypted Journal snapshot",{
            val captured=repo.journal
            work { adapter->val result=adapter.upload(captured);if(current()) {
                checkpoint=adapter.checkpoint()
                notice=if(result.localJournalStillMatches) "Encrypted Journal snapshot acknowledged at revision ${result.receipt.revision}. Local records are kept." else "The captured snapshot was acknowledged. Newer local edits remain to be uploaded."
            } }
        },enabled=service!=null && !busy && !loading && checkpoint?.deleted!=true && repo.storageReady) }
        checkpoint?.takeIf { it.revision>0 && !it.deleted }?.let { saved->
            TextButton(onClick={deleting=true},enabled=service!=null && !busy && !loading && saved.pending==null) { Text("Delete this remote archive",color=Danger) }
        }
        Text("A server acknowledgment does not prove independent backup or recovery. Your current Journal is kept after every operation.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    Panel("Remote encrypted items") {
        Action("List workspace items",{work { adapter->val page=adapter.changes(0);if(current()) { rows=page.changes.sortedByDescending { it.sequence };cursor=page.cursor;hasMore=page.hasMore } }},false,service!=null && !busy && !loading)
        rows.forEach { row->
            if(row.deleted) Text("Deleted item · ${row.objectId.take(8)} · revision ${row.revision}",color=Muted,style=MaterialTheme.typography.bodySmall)
            else TextButton(enabled=!busy && !loading,onClick={work { adapter->
                preview=null;review=null;val value=adapter.preview(row.objectId,row.revision);if(current()) { preview=value;expanded=false }
            }}) { Text("Preview item ${row.objectId.take(8)} · revision ${row.revision}",color=Link) }
        }
        if(hasMore) Action("Load more items",{work { adapter->val page=adapter.changes(cursor);if(current()) {
            rows=(rows+page.changes).associateBy { it.objectId }.values.sortedByDescending { it.sequence };cursor=page.cursor;hasMore=page.hasMore
        } }},false,!busy && !loading)
        Text("An item is treated as a Journal only after its encrypted type and account binding verify. Other feature objects may appear in this list.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    preview?.let { snapshot->Panel("Verified Journal preview") {
        fun count(key:String)=snapshot.journal[key]?.jsonArray?.size ?: 0
        val captured=runCatching { Instant.ofEpochMilli(snapshot.capturedAt).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d, yyyy · h:mm a")) }.getOrDefault("Unavailable")
        Text("Captured: $captured");Text("Records: ${count("entries")}")
        Text("Offers / decisions / work: ${count("gigOffers")+count("observedOffers")} / ${count("gigDecisions")+count("offerReviews")} / ${count("gigCommitments")}")
        Text("Bank review rows: ${count("bankTransactions")}");Text("Coach history / pending: ${count("coachMessages")} / ${count("coachOutbox")}")
        if(snapshot.journal["activeTripId"]!=null && snapshot.journal["activeTripId"] !is JsonNull) Text("Source includes an interrupted or active drive. It will not be started on this device.",color=Caution,style=MaterialTheme.typography.bodySmall)
        TextButton(onClick={expanded=!expanded}) { Text(if(expanded) "Hide record preview" else "Record preview",color=Link) }
        if(expanded) snapshot.journal["entries"]!!.jsonArray.take(20).forEach { entry->
            val record=entry.jsonObject["record"]!!.jsonObject;val body=record["body"]?.jsonObject
            val label=when(record["kind"]?.jsonPrimitive?.content) {
                "trip"->body?.get("purpose")?.jsonPrimitive?.content?.takeIf { it.isNotBlank() } ?: "Driving trip"
                "expense"->body?.get("merchant")?.jsonPrimitive?.content ?: "Expense"
                "income"->body?.get("description")?.jsonPrimitive?.content ?: "Income"
                else->"Recorded item"
            }
            Text(label);body?.get("date")?.jsonPrimitive?.content?.let { Text(it,color=Muted,style=MaterialTheme.typography.bodySmall) }
        }
        Action("Prepare import review",{
            val adapter=service ?: return@Action
            try {
                val available=snapshot.journal["receipts"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }.filter { runCatching { repo.store.receipt(namespace,it) }.isSuccess }.toSet()
                review=adapter.prepareImport(snapshot,available)
            } catch(failure:Exception) { error=failure.message }
        },false,!busy && !loading)
        Text("Preview and review do not restore, merge or overwrite the current Journal, files, active drive or device settings.",color=Muted,style=MaterialTheme.typography.bodySmall)
    } }
    review?.let { candidate->Panel("Import review · no changes applied") {
        candidate.notes.forEach { Text(it,color=Muted,style=MaterialTheme.typography.bodySmall) }
        if(!candidate.stillMatches(repo.journal)) Text("Your local Journal changed after this review. Prepare a fresh review before any future import.",color=Caution,style=MaterialTheme.typography.bodySmall)
    } }
    Action("Check account setup again",{jobs.launch { configure() }},false,!busy && !loading && connection!=null)
    if(deleting) AlertDialog(onDismissRequest={deleting=false},title={Text("Delete this phone’s remote encrypted archive?")},text={Text("The local Journal, receipt/route files and older retained backups are kept.")},
        confirmButton={TextButton(onClick={deleting=false;work { adapter->adapter.deleteOwn();if(current()) {
            checkpoint=adapter.checkpoint();preview=null;review=null;rows=emptyList();hasMore=false;cursor=0
            notice="Remote archive deleted. Your local Journal and attachments are kept; retained backups need their own review."
        } }}) { Text("Delete remote archive",color=Danger) }},dismissButton={TextButton(onClick={deleting=false}) { Text("Cancel") }})
}
