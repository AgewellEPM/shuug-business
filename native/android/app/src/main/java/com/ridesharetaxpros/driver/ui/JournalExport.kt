package com.ridesharetaxpros.driver.ui

import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.exportCSV
import com.ridesharetaxpros.driver.core.today
import com.ridesharetaxpros.driver.data.Connection
import com.ridesharetaxpros.driver.data.DriverRepository
import kotlinx.coroutines.*

const val MAX_JOURNAL_CSV_BYTES=20*1024*1024
private data class PreparedJournalExport(val bytes: ByteArray,val scope: String,val connection: Connection?)

/** Capture once, then save only to the location explicitly chosen through Android. */
@Composable fun rememberJournalExport(repo: DriverRepository): ()->Unit {
    val jobs=rememberCoroutineScope()
    var prepared by remember {mutableStateOf<PreparedJournalExport?>(null)}
    var phase by remember {mutableStateOf("")}
    var notice by remember {mutableStateOf<String?>(null)}
    var failed by remember {mutableStateOf(false)}
    var generation by remember {mutableIntStateOf(0)}
    var job by remember {mutableStateOf<Job?>(null)}
    fun isCurrent(snapshot: PreparedJournalExport)=snapshot.scope==repo.scope && snapshot.connection==repo.connection
    fun requireCurrent(snapshot: PreparedJournalExport) {require(isCurrent(snapshot)) {"Your account changed. Start the export again."}}
    fun cancel() {generation++;job?.cancel();prepared=null;phase=""}
    suspend fun removeIncomplete(uri: Uri) {withContext(NonCancellable+Dispatchers.IO) {runCatching {DocumentsContract.deleteDocument(repo.app.contentResolver,uri)}}}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) {uri->
        val snapshot=prepared;prepared=null
        if(uri==null) phase=""
        else if(snapshot==null) {phase="";job=jobs.launch {removeIncomplete(uri)}}
        else {
            val request=++generation;phase="saving";notice=null
            job=jobs.launch {
                try {
                    requireCurrent(snapshot);require(snapshot.bytes.size<=MAX_JOURNAL_CSV_BYTES)
                    withTimeout(30000) {withContext(Dispatchers.IO) {
                        requireCurrent(snapshot)
                        repo.app.contentResolver.openOutputStream(uri,"wt")?.use {stream->
                            var offset=0
                            while(offset<snapshot.bytes.size) {
                                ensureActive();requireCurrent(snapshot)
                                val length=minOf(65536,snapshot.bytes.size-offset);stream.write(snapshot.bytes,offset,length);offset+=length
                            }
                            stream.flush();ensureActive();requireCurrent(snapshot)
                        } ?: error("The location you chose could not save this CSV.")
                    }}
                    if(request==generation && isCurrent(snapshot)) {failed=false;notice="Your records were saved as a CSV in the location you chose."}
                } catch(problem: Exception) {
                    removeIncomplete(uri)
                    if(problem is CancellationException && problem !is TimeoutCancellationException) throw problem
                    if(request==generation && isCurrent(snapshot)) {failed=true;notice=if(problem is TimeoutCancellationException) "Saving took too long. Try another location. Your original records are kept." else problem.message ?: "The CSV could not be saved. Your original records are kept."}
                } finally {if(request==generation) phase=""}
            }
        }
    }
    DisposableEffect(Unit) {onDispose {job?.cancel()}}
    LaunchedEffect(repo.scope,repo.connection) {prepared?.takeIf {!isCurrent(it)}?.let {cancel()}}
    if(phase=="preparing" || phase=="saving") AlertDialog(onDismissRequest={cancel()},title={Text(if(phase=="preparing") "Preparing your CSV" else "Saving your CSV")},
        text={LinearProgressIndicator()},confirmButton={TextButton(onClick={cancel()}) {Text("Cancel")}})
    notice?.let {message->AlertDialog(onDismissRequest={notice=null},title={Text(if(failed) "CSV could not be saved" else "CSV saved")},text={Text(message)},confirmButton={TextButton(onClick={notice=null}) {Text("Done")}})}
    return {
        if(phase.isEmpty()) {
            val records=repo.journal.visible.map {it.record}.toList()
            val scope=repo.scope;val connection=repo.connection;val request=++generation
            phase="preparing";notice=null
            job=jobs.launch {
                try {
                    val snapshot=withContext(Dispatchers.Default) {
                        val context=currentCoroutineContext()
                        val csv=exportCSV(records,MAX_JOURNAL_CSV_BYTES) {context.ensureActive();require(repo.scope==scope && repo.connection==connection) {"Your account changed. Start the export again."}}
                        context.ensureActive();PreparedJournalExport(csv.toByteArray(Charsets.UTF_8),scope,connection)
                    }
                    requireCurrent(snapshot)
                    if(request==generation) {prepared=snapshot;phase="picker";picker.launch("GigTaxPros-${today()}.csv")}
                } catch(problem: Exception) {
                    if(problem is CancellationException) throw problem
                    if(request==generation) {prepared=null;phase="";failed=true;notice=problem.message ?: "The CSV could not be prepared. Your original records are kept."}
                }
            }
        }
    }
}
