package com.ridesharetaxpros.driver.ui

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.font.FontWeight
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.serialization.json.*
import java.io.ByteArrayOutputStream

private data class PendingDocument(val request:String,val requestName:String,val name:String,val mime:String,val bytes:ByteArray,val identity:String)
private fun JsonObject.text(key:String)=get(key)?.jsonPrimitive?.contentOrNull
private fun JsonObject.rows(key:String)=(get(key) as? JsonArray) ?: JsonArray(emptyList())
private fun format(bytes:ByteArray):String=when {
    bytes.size>=5 && bytes.copyOfRange(0,5).toString(Charsets.US_ASCII)=="%PDF-"->"application/pdf"
    bytes.size>=3 && bytes[0]==0xff.toByte() && bytes[1]==0xd8.toByte() && bytes[2]==0xff.toByte()->"image/jpeg"
    bytes.size>=8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))->"image/png"
    else->error("Choose a PDF, JPEG or PNG document.")
}
@Composable fun TaxDocumentsScreen(repo:DriverRepository) {
    val identity=repo.connection?.let {it.origin+"|"+it.session.account.id+"|"+it.session.token} ?: "guest"
    var summary by remember(identity) {mutableStateOf<JsonObject?>(null)};var busy by remember {mutableStateOf(false)}
    var errorMessage by remember {mutableStateOf<String?>(null)};var notice by remember {mutableStateOf<String?>(null)}
    var request by remember {mutableStateOf<JsonObject?>(null)};var pending by remember {mutableStateOf<PendingDocument?>(null)}
    var year by remember {mutableStateOf("All years")}
    fun current()=repo.connection?.let {it.origin+"|"+it.session.account.id+"|"+it.session.token} ?: "guest"
    fun refresh() {val connection=repo.connection ?: return;busy=true;repo.run {try {
        val value=Wire.parseToJsonElement(WorkspaceClient(connection).send("tax").toString(Charsets.UTF_8)).jsonObject
        require(value["apiVersion"]?.jsonPrimitive?.int==1) {"This workspace uses an unsupported tax-document connection."}
        if(current()==identity) {summary=value["tax"] as? JsonObject;errorMessage=null}
    }catch(e:Exception) {if(current()==identity) errorMessage=e.message}finally {busy=false}}}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri:Uri?->
        val selected=request;request=null
        if(uri!=null && selected!=null && current()==identity) repo.run {try {
            var name="Tax document"
            repo.app.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->if(cursor.moveToFirst()) name=cursor.getString(0)}
            name=name.replace(Regex("[\\p{Cntrl}\\\"\\\\/]"),"_").trim().take(160).ifBlank {"Tax document"}
            val bytes=repo.app.contentResolver.openInputStream(uri)?.use {boundedRead(it,10*1024*1024)} ?: error("The selected document could not be read.")
            require(bytes.isNotEmpty()) {"Choose a document between 1 byte and 10 MB."}
            val mime=format(bytes)
            if(current()==identity) pending=PendingDocument(selected.text("id")!!,selected.text("name") ?: "Document request",name,mime,bytes,identity)
        }catch(e:Exception) {if(current()==identity)errorMessage=e.message}}
    }
    LaunchedEffect(identity) {refresh()}
    Panel {
        Text("Your tax team’s shared progress, document requests and received files use the same client account as your app records.")
        Text("Receiving a file is separate from staff review. These updates do not calculate taxes or prove a return was filed.",color=Muted)
    }
    if(repo.connection==null) Panel {Text("Connect your invited client account in Your account to see your tax work.",color=Muted)}
    else {
        if(busy) CircularProgressIndicator(color=Pink)
        errorMessage?.let {Text(it,color=Caution)};notice?.let {Text(it,color=Income)}
        summary?.let {data->
            val years=(data.rows("engagements")+data.rows("quarterly")).mapNotNull {it.jsonObject.text("year")}.distinct().sortedDescending()
            if(years.isNotEmpty()) Choice("Tax year",year,linkedMapOf("All years" to "All years").apply {years.forEach {put(it,it)}}) {year=it}
            data.rows("engagements").filter {year=="All years" || it.jsonObject.text("year")==null || it.jsonObject.text("year")==year}.forEach {value->val engagement=value.jsonObject
                Panel(engagement.text("name") ?: "Tax engagement") {
                    Text(engagement.text("stage")?.replace('_',' ') ?: "Progress not shared",fontWeight=FontWeight.SemiBold)
                    engagement.text("message")?.let {Text(it,color=Muted)}
                    engagement.rows("records").forEach {value->val r=value.jsonObject
                        Text(r.text("name") ?: r.text("platform") ?: "Record status",fontWeight=FontWeight.SemiBold)
                        for(key in listOf("income","mileage","expenses","message")) r.text(key)?.takeIf {it.isNotBlank()}?.let {Text("${key.replaceFirstChar {c->c.uppercase()}}: $it",color=Muted)}
                    }
                    engagement.rows("documents").forEach {value->val row=value.jsonObject
                        HorizontalDivider();Text(row.text("name") ?: "Document request",fontWeight=FontWeight.SemiBold)
                        Text(row.text("status")?.replace('_',' ') ?: "Requested",color=Link)
                        row.text("message")?.let {Text(it,color=Muted)}
                        if(row["uploadAvailable"]?.jsonPrimitive?.booleanOrNull==true) Action("Choose a document for this request",{request=row;picker.launch(arrayOf("application/pdf","image/jpeg","image/png"))},false,!busy)
                        row.rows("submissions").forEach {item->val doc=item.jsonObject
                            Text(doc.text("name") ?: "Received document")
                            Text(when(doc.text("status")) {"received"->"Received by your firm";"reviewed"->"Staff marked reviewed";"replacement_requested"->"Replacement requested";else->doc.text("status") ?: "Status not shared"},color=Muted)
                            TextButton(enabled=!busy,onClick={busy=true;repo.run {try {
                                val connection=repo.connection ?: error("Connect your client account first.")
                                val id=doc.text("id")!!;require(id.matches(Regex("[a-fA-F0-9-]{36}")))
                                val size=doc["size"]?.jsonPrimitive?.int ?: 0;require(size in 1..10*1024*1024)
                                val bytes=WorkspaceClient(connection).customer("documents/$id",maximum=10*1024*1024)
                                require(current()==identity) {"Your account changed."};require(bytes.size==size && format(bytes)==doc.text("mime")) {"The returned document does not match its saved file information."}
                                shareBytes(repo,bytes,format(bytes),doc.text("name") ?: "Tax document")
                            }catch(e:Exception){if(current()==identity)errorMessage=e.message}finally {busy=false}}}) {Text("Open or share document")}
                        }
                    }
                }
            }
            data.rows("quarterly").filter {year=="All years" || it.jsonObject.text("year")==year}.forEach {value->val row=value.jsonObject
                Panel(row.text("name") ?: "Quarterly review") {Text("${row.text("quarter") ?: ""} · ${row.text("status") ?: ""}");row.text("message")?.let {Text(it,color=Muted)};row.text("reviewOn")?.let {Text("Review on: $it",color=Muted)}}
            }
            if(data.rows("engagements").isEmpty() && data.rows("quarterly").isEmpty()) Text("Your tax team has not shared progress or document requests yet.",color=Muted)
        }
        Action("Refresh",{refresh()},false,!busy)
    }
    pending?.let {upload->AlertDialog(onDismissRequest={pending=null},title={Text("Send this document to your tax team?")},text={Text("${upload.name}\nRequest: ${upload.requestName}\nYour original stays in its current location.")},
        confirmButton={TextButton(onClick={pending=null;busy=true;repo.run {try {
            require(upload.identity==current()) {"Your account changed. Choose the document again."}
            val connection=repo.connection ?: error("Connect your client account first.");val boundary="GigTaxPros-${uuid()}"
            val body=ByteArrayOutputStream().apply {
                write("--$boundary\r\nContent-Disposition: form-data; name=\"requestId\"\r\n\r\n${upload.request}\r\n".toByteArray())
                write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${upload.name}\"\r\nContent-Type: ${upload.mime}\r\n\r\n".toByteArray());write(upload.bytes);write("\r\n--$boundary--\r\n".toByteArray())
            }.toByteArray()
            WorkspaceClient(connection).customer("documents","POST",body,"multipart/form-data; boundary=$boundary",32000)
            if(current()==identity) {notice="Your firm received the document. Staff review is a separate step.";refresh()}
        }catch(e:Exception){if(current()==identity)errorMessage=e.message}finally {busy=false}}}) {Text("Upload to this request")}},dismissButton={TextButton(onClick={pending=null}) {Text("Cancel")}})}
}
