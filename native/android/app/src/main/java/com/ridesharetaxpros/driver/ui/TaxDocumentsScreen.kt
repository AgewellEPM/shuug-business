package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.font.FontWeight
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

private data class PendingDocument(val request:String,val requestName:String,val name:String,val mime:String,val bytes:ByteArray,val identity:String)
private data class SelectedDocumentRequest(val row:JsonObject,val identity:String)
private fun JsonObject.text(key:String)=get(key)?.jsonPrimitive?.contentOrNull
private fun JsonObject.rows(key:String)=(get(key) as? JsonArray) ?: JsonArray(emptyList())
private fun documentDate(raw:String):String=runCatching { Instant.parse(raw).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d, yyyy · h:mm a")) }.getOrDefault(raw)
private fun documentScope(repo:DriverRepository)=repo.connection?.let { it.origin+"|"+it.session.account.id+"|"+it.session.token } ?: "guest"

@Composable fun TaxDocumentsScreen(repo:DriverRepository) {
    val identity=documentScope(repo);val jobs=rememberCoroutineScope()
    var summary by remember(identity) { mutableStateOf<JsonObject?>(null) };var loading by remember(identity) { mutableStateOf(false) };var busy by remember(identity) { mutableStateOf(false) }
    var errorMessage by remember(identity) { mutableStateOf<String?>(null) };var notice by remember(identity) { mutableStateOf<String?>(null) }
    var request by remember(identity) { mutableStateOf<SelectedDocumentRequest?>(null) };var pending by remember(identity) { mutableStateOf<PendingDocument?>(null) }
    var preview by remember(identity) { mutableStateOf<DocumentPreviewData?>(null) };var year by remember(identity) { mutableStateOf("0") }
    fun current()=documentScope(repo)==identity
    fun requireCurrent() { require(current()) { "Your account changed. Reopen your tax workspace before continuing." } }
    suspend fun refresh() {
        val connection=repo.connection ?: return;requireCurrent();loading=true
        try {
            val value=Wire.parseToJsonElement(WorkspaceClient(connection).send("tax").toString(Charsets.UTF_8)).jsonObject
            require(value["apiVersion"]?.jsonPrimitive?.intOrNull==1) { "This workspace uses an unsupported tax-document connection." }
            requireCurrent();summary=value["tax"] as? JsonObject;errorMessage=null
            if(summary==null) notice="Your tax workspace is not available. Contact your firm."
        } catch(failure:Exception) { if(failure is CancellationException) throw failure;if(current()) errorMessage=failure.message }
        finally { if(current()) loading=false }
    }
    fun work(block:suspend ()->Unit) {
        if(busy || loading || !current()) return;busy=true;errorMessage=null
        jobs.launch {
            try { requireCurrent();block() }
            catch(failure:Exception) { if(failure is CancellationException) throw failure;if(current()) errorMessage=failure.message }
            finally { if(current()) busy=false }
        }
    }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri:Uri?->
        val selected=request;request=null
        if(uri!=null && selected!=null && selected.identity==documentScope(repo) && current()) work {
            val value=withContext(Dispatchers.IO) {
                requireCurrent();var name="Tax document"
                repo.app.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor->if(cursor.moveToFirst()) name=cursor.getString(0) ?: name }
                name=name.replace(Regex("[\\p{Cntrl}\\\"\\\\/]"),"_").trim().take(160).ifBlank { "Tax document" }
                val bytes=repo.app.contentResolver.openInputStream(uri)?.use { boundedRead(it,MAX_NATIVE_DOCUMENT_BYTES) } ?: error("The selected document could not be read.")
                val mime=validatedDocumentMime(bytes);requireCurrent()
                PendingDocument(selected.row.text("id") ?: error("This document request is unavailable."),selected.row.text("name") ?: "Document request",name,mime,bytes,identity)
            }
            if(current()) pending=value
        }
    }
    LaunchedEffect(identity) { refresh() }
    Panel {
        Text("Your tax team’s shared progress, document requests and received files use the same client account as your app records.")
        Text("Receiving a file is separate from staff review. These updates do not calculate taxes or prove a return was filed.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    if(repo.connection==null) Panel { Text("Connect your invited client account in Your account to see your tax work.",color=Muted) }
    else {
        if(loading) { CircularProgressIndicator(color=Pink);Text("Loading your tax workspace…",color=Muted) }
        if(busy) { LinearProgressIndicator(color=Route);Text("Working with your private document…",color=Muted) }
        errorMessage?.let { Text(it,color=Caution) };notice?.let { Text(it,color=Link) }
        summary?.let { data->
            val years=(data.rows("engagements")+data.rows("quarterly")).mapNotNull { it.jsonObject.text("year") }.distinct().sortedDescending()
            if(years.isNotEmpty()) Choice("Tax year",year,linkedMapOf("0" to "All shared years").apply { years.forEach { put(it,it) } }) { year=it }
            fun selected(value:JsonElement)=year=="0" || value.jsonObject.text("year")==null || value.jsonObject.text("year")==year
            val engagements=data.rows("engagements").filter(::selected);val quarterly=data.rows("quarterly").filter(::selected)
            if(engagements.isEmpty()) Panel("Your tax work") { Text("No engagement updates are shared for this selection yet.",color=Muted) }
            engagements.forEach { value->val engagement=value.jsonObject
                Panel(engagement.text("name") ?: "Tax engagement") {
                    val prefix=engagement.text("year")?.let { "Tax year $it · " }.orEmpty()
                    Text(prefix+(engagement.text("stage")?.replace('_',' ') ?: "Progress not shared"),fontWeight=FontWeight.SemiBold)
                    engagement.text("message")?.takeIf { it.isNotBlank() }?.let { Text(it,color=Muted) }
                    engagement.rows("documents").forEach { value->val row=value.jsonObject
                        HorizontalDivider();Text(row.text("name") ?: "Document request",fontWeight=FontWeight.SemiBold)
                        Text("Request: "+(row.text("status")?.replace('_',' ') ?: "Requested"),color=Link)
                        row.text("requestedBy")?.takeIf { it.isNotBlank() }?.let { Text("Requested by your firm: $it",color=Muted,style=MaterialTheme.typography.bodySmall) }
                        row.text("message")?.takeIf { it.isNotBlank() }?.let { Text(it,color=Muted) }
                        if(row["uploadAvailable"]?.jsonPrimitive?.booleanOrNull==true) Action("Choose PDF or image to upload",{
                            errorMessage=null;request=SelectedDocumentRequest(row,identity);picker.launch(arrayOf("application/pdf","image/jpeg","image/png"))
                        },false,!busy && !loading)
                        Text("PDF, JPEG or PNG · Up to 10 MB each. Confirm the file and request before sending.",color=Muted,style=MaterialTheme.typography.bodySmall)
                        row.rows("submissions").forEach { item->val doc=item.jsonObject
                            Text(doc.text("name") ?: "Received document",fontWeight=FontWeight.SemiBold)
                            val status=when(doc.text("status")) { "received"->"Received by your firm";"reviewed"->"Staff marked reviewed";"replacement_requested"->"Replacement requested";else->doc.text("status") ?: "Status not shared" }
                            Text(status+(doc.text("createdAt")?.let { " · "+documentDate(it) } ?: ""),color=Muted,style=MaterialTheme.typography.bodySmall)
                            doc.text("reviewedAt")?.let { Text("Review update: ${documentDate(it)}",color=Muted,style=MaterialTheme.typography.bodySmall) }
                            TextButton(enabled=!busy && !loading,onClick={work {
                                val connection=repo.connection ?: error("Connect your client account first.")
                                val id=doc.text("id") ?: error("This document is unavailable.")
                                require(runCatching { UUID.fromString(id).toString()==id }.getOrDefault(false))
                                val size=doc["size"]?.jsonPrimitive?.intOrNull ?: 0;require(size in 1..MAX_NATIVE_DOCUMENT_BYTES)
                                val bytes=WorkspaceClient(connection).customer("documents/$id",maximum=MAX_NATIVE_DOCUMENT_BYTES)
                                requireCurrent();require(bytes.size==size) { "The returned document size differs from its saved file information." }
                                val mime=validatedDocumentMime(bytes,doc.text("mime") ?: error("The saved document type is unavailable."))
                                preview=DocumentPreviewData(doc.text("name") ?: "Tax document",bytes,mime)
                            }}) { Text("Preview / save a copy",color=Link) }
                        }
                        if(row.rows("submissions").isEmpty()) Text("No files received for this request yet.",color=Muted,style=MaterialTheme.typography.bodySmall)
                    }
                    if(engagement.rows("documents").isEmpty()) Text("No document requests are shared for this engagement.",color=Muted,style=MaterialTheme.typography.bodySmall)
                    engagement.rows("records").forEach { value->val row=value.jsonObject
                        HorizontalDivider();Text(row.text("name") ?: "Record status",fontWeight=FontWeight.SemiBold)
                        row.text("platform")?.takeIf { it.isNotBlank() }?.let { Text(it,color=Muted,style=MaterialTheme.typography.bodySmall) }
                        Text("Income records: ${row.text("income") ?: "Not shared"}")
                        Text("Mileage records: ${row.text("mileage") ?: "Not shared"}")
                        Text("Expense records: ${row.text("expenses") ?: "Not shared"}")
                        row.text("message")?.takeIf { it.isNotBlank() }?.let { Text(it,color=Muted) }
                    }
                }
            }
            if(quarterly.isNotEmpty()) Panel("Quarterly reviews") {
                quarterly.forEach { value->val row=value.jsonObject
                    Text(row.text("name") ?: "Quarterly review",fontWeight=FontWeight.SemiBold)
                    Text((row.text("quarter") ?: "")+(row.text("year")?.let { " · $it" } ?: "")+" · "+(row.text("status") ?: "Status not shared"))
                    row.text("reviewOn")?.takeIf { it.isNotBlank() }?.let { Text("Staff review: $it",color=Muted,style=MaterialTheme.typography.bodySmall) }
                    row.text("message")?.takeIf { it.isNotBlank() }?.let { Text(it,color=Muted) }
                }
                Text("Staff review dates are not tax payment or filing deadlines. Confirm those dates with your preparer.",color=Muted,style=MaterialTheme.typography.bodySmall)
            }
        }
        Action("Open My Portal",{
            try { requireCurrent();val connection=repo.connection ?: error("Connect your client account first.")
                repo.app.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(connection.origin+"/api/website/customer#tax-work")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch(failure:Exception) { if(current()) errorMessage=failure.message ?: "My Portal could not be opened." }
        },false,!busy && !loading)
        Action("Refresh",{jobs.launch { refresh() }},false,!busy && !loading)
    }
    pending?.let { upload->AlertDialog(onDismissRequest={pending=null},title={Text("Send this document to your tax team?")},text={Text("${upload.name}\nRequest: ${upload.requestName}\nYour original stays in its current location.")},
        confirmButton={TextButton(onClick={pending=null;work {
            require(upload.identity==documentScope(repo)) { "Your account changed. Choose the document again." }
            val connection=repo.connection ?: error("Connect your client account first.");val boundary="GigTaxPros-${uuid()}"
            val body=withContext(Dispatchers.IO) { ByteArrayOutputStream().apply {
                write("--$boundary\r\nContent-Disposition: form-data; name=\"requestId\"\r\n\r\n${upload.request}\r\n".toByteArray())
                write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${upload.name}\"\r\nContent-Type: ${upload.mime}\r\n\r\n".toByteArray());write(upload.bytes);write("\r\n--$boundary--\r\n".toByteArray())
            }.toByteArray() }
            requireCurrent()
            try {
                val reply=Wire.parseToJsonElement(WorkspaceClient(connection).customer("documents","POST",body,"multipart/form-data; boundary=$boundary",32000).toString(Charsets.UTF_8)).jsonObject
                requireCurrent();require(reply["document"] is JsonObject) { "The workspace did not confirm receipt. Keep the original and retry." }
                notice=(reply["document"]!!.jsonObject.text("name") ?: upload.name)+" was received by your firm. Staff review is a separate step.";refresh()
            } catch(failure:Exception) { if(failure is CancellationException) throw failure;throw IllegalStateException("Document not confirmed received. Keep the original and retry. ${failure.message}",failure) }
        }}) { Text("Upload to this request") }},dismissButton={TextButton(onClick={pending=null}) { Text("Cancel") }}) }
    preview?.let { document->NativeDocumentPreview(repo,document) { preview=null } }
}
