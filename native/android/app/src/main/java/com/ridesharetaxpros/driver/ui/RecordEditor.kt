package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.coroutines.*
import java.io.File
import java.time.*
import java.time.format.DateTimeFormatter
import kotlin.math.abs

@Composable fun RecordEditor(repo: DriverRepository,original: DriverRecord?,bank: BankTransaction?,prompt: ExpensePrompt?,done: ()->Unit,onSaveReady:(((()->Unit)?,Boolean)->Unit)?=null) {
    val loadedIdentity=remember {receiptScope(repo)};val jobs=rememberCoroutineScope()
    var validation by remember {mutableStateOf<String?>(null)};var attaching by remember {mutableStateOf(false)}
    fun requireCurrent() {check(receiptScope(repo)==loadedIdentity) {"Your account changed. Reopen this editor before saving."}}
    fun edit(block:suspend ()->Unit) {jobs.launch {try {requireCurrent();block()} catch(failure:Exception) {if(failure is CancellationException)throw failure;validation=failure.message}}}
    val kind=original?.kind ?: if((bank?.amountCents ?: 1)<0) "income" else "expense"
    val expense=original?.takeIf { kind=="expense" }?.expense(); val income=original?.takeIf { kind=="income" }?.income(); val trip=original?.takeIf { kind=="trip" }?.trip()
    val zone=trip?.timeZoneId?.let(ZoneId::of) ?: if(trip!=null) ZoneOffset.UTC else ZoneId.systemDefault()
    var title by remember { mutableStateOf(original?.title?.takeIf { original.kind!="trip" } ?: trip?.purpose ?: bank?.merchant ?: prompt?.merchant ?: "") }
    var date by remember { mutableStateOf(trip?.startedAt?.let {day(it,zone.id)} ?: original?.date ?: bank?.date ?: today()) }
    var amount by remember { mutableStateOf((expense?.amountCents ?: income?.amountCents ?: bank?.amountCents?.let(::abs))?.takeIf { it>0 }?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var classification by remember { mutableStateOf(expense?.classification ?: trip?.classification ?: "unclassified") }
    var category by remember { mutableStateOf(expense?.category ?: bank?.suggestedCategory ?: prompt?.category ?: "other") }
    var notes by remember { mutableStateOf(expense?.notes ?: income?.notes ?: trip?.notes ?: "") }
    var purpose by remember { mutableStateOf(expense?.businessPurpose ?: "") }; var percent by remember { mutableStateOf(expense?.businessUsePercent?.toString() ?: "") }
    var meal by remember { mutableStateOf(expense?.mealContext ?: "") }; var vehicle by remember { mutableStateOf(expense?.vehicle ?: "") }
    var odometer by remember { mutableStateOf(expense?.odometerMiles?.toString() ?: "") }; var payment by remember { mutableStateOf(expense?.paymentMethod ?: if(bank!=null && kind=="expense") "bank" else "") }
    var place by remember { mutableStateOf(expense?.place ?: prompt?.address ?: "") }; var receiptId by remember { mutableStateOf(expense?.receiptId) }
    var miles by remember { mutableStateOf(trip?.let { "%.3f".format(java.util.Locale.US,it.distanceMeters/1609.344) } ?: "") }
    var fare by remember { mutableStateOf(trip?.earningsCents?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var fees by remember { mutableStateOf(trip?.platformFeesCents?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var role by remember { mutableStateOf(trip?.rideRole ?: "other") }; var platform by remember { mutableStateOf(trip?.platform ?: income?.platform ?: if(kind=="income") {if(bank!=null) "other" else "uber"} else "") }
    var area by remember { mutableStateOf(trip?.workArea ?: "") }
    fun time(value: String?)=value?.let { Instant.parse(it).atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm")) } ?: ""
    var start by remember { mutableStateOf(time(trip?.startedAt)) }; var end by remember { mutableStateOf(time(trip?.endedAt)) }
    var endDate by remember { mutableStateOf(trip?.endedAt?.let { day(it,zone.id) } ?: date) }
    var duplicateConfirmed by remember { mutableStateOf(false) }; var showDelete by remember { mutableStateOf(false) }
    var receiptBytes by remember { mutableStateOf<ByteArray?>(null) }; var ocr by remember { mutableStateOf("") }; var reading by remember { mutableStateOf(false) }
    var receiptResent by remember { mutableStateOf(false) }; var detailsExpanded by remember {mutableStateOf(false)}
    var preview by remember {mutableStateOf<DocumentPreviewData?>(null)}
    var scanOpen by remember {mutableStateOf(false)};var ocrJob by remember {mutableStateOf<Job?>(null)}
    var generation by remember {mutableIntStateOf(0)};var loadedReceipt by remember {mutableStateOf<String?>(null)}
    val currency=expense?.currency ?: income?.currency ?: "USD"
    fun clearRecognition() {generation++;ocrJob?.cancel();ocrJob=null;ocr="";reading=false;receiptResent=false}
    fun install(capture:ReceiptCapture) {
        requireCurrent();require(capture.bytes.size in 1..MAX_RECEIPT_BYTES);validatedDocumentMime(capture.bytes,capture.mime)
        clearRecognition();val receipt=repo.addReceipt(capture.bytes,capture.mime)
        receiptId=receipt.id;receiptBytes=capture.bytes;loadedReceipt=receipt.id
    }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri->
        if(uri!=null) {clearRecognition();attaching=true;edit {
            try {
                val capture=withContext(Dispatchers.IO) {
                    requireCurrent();val mime=repo.app.contentResolver.getType(uri)
                    val bytes=repo.app.contentResolver.openInputStream(uri)?.use {boundedRead(it,32*1024*1024)} ?: error("The receipt could not be read.")
                    normalizeReceipt(bytes,mime)
                }
                requireCurrent();install(capture)
            } finally {attaching=false}
        }}
    }
    LaunchedEffect(receiptId) {
        val id=receiptId
        if(id==null) {receiptBytes=null;loadedReceipt=null}
        else if(loadedReceipt!=id) {
            receiptBytes=null
            try {val bytes=repo.receipt(id);requireCurrent();if(receiptId==id) {receiptBytes=bytes;loadedReceipt=id}}
            catch(failure:Exception) {if(failure is CancellationException)throw failure;validation=failure.message}
        }
    }
    DisposableEffect(Unit) {onDispose {ocrJob?.cancel()}}
    FormSection(if(kind=="trip") "Trip" else if(kind=="expense") "Expense" else "Income",background=Panel,spacing=0.dp) {
        if(kind=="trip") {
            RecordDateTimeRow("Start",date,start,{date=it},{start=it})
            RecordDateTimeRow("End",endDate,end,{endDate=it},{end=it})
            Field("Miles",miles,{miles=it})
            Choice("Classification",classification,classifications) {classification=it}
            RecordFormDivider()
            Field("Purpose",title,{title=it.take(240)})
        } else {
            Field(if(kind=="expense") "Merchant" else "Description",title,{title=it.take(160)})
            Field("Amount · $currency (12.34)",amount,{amount=it})
            DateField("Date",date) {date=it}
            RecordFormDivider()
            if(kind=="expense") {
                Choice("Category",category,expenseCategories) {category=it}
                RecordFormDivider()
                Choice("Classification",classification,classifications) {classification=it}
                RecordFormDivider()
            } else Choice("Platform",platform,linkedMapOf("uber" to "Uber / Uber Eats","lyft" to "Lyft","doordash" to "DoorDash","instacart" to "Instacart","spark" to "Spark","other" to "Other gig work")) {platform=it}
        }
        Field("Notes",notes,{notes=it.take(2000)},true)
        (bank?.reference ?: original?.bankReference)?.let { Text("Source: ${it.accountLabel} · ${it.provider}",color=Muted) }
    }
    if(kind=="trip") FormSection("Ride earnings · optional",background=Panel,spacing=0.dp) {
        Choice("Drive type",role,linkedMapOf("ride" to "Passenger ride","delivery" to "Delivery","shopping" to "In-store shopping","reposition" to "Driving without a paid ride","other" to "Other / review")) {role=it}
        RecordFormDivider()
        Field("Fare + tips before fees · USD",fare,{fare=it});Field("Platform fees · USD (0 if none)",fees,{fees=it})
        Field("Platform (Uber, Lyft…)",platform,{platform=it.take(80)});Field("Work area / neighborhood",area,{area=it.take(120)})
        Text("Use the actual ride breakdown. If you enter take-home pay after fees, enter 0 for fees so they are not subtracted twice. A bank payout is not an individual ride fare. Leave unknown values blank.",fontSize=13.sp,lineHeight=18.sp)
        RecordFormDivider()
        Text("To analyze pickup and unpaid travel, save those legs as Driving without a paid ride. Automatically detected drives may contain multiple rides; split or correct them using your platform records.",fontSize=13.sp,lineHeight=18.sp)
    }
    if(kind=="trip") FormSection(spacing=0.dp) {
        Text("Times use ${zone.id}.",fontSize=17.sp)
        RecordFormDivider()
        Text("Enter observed mileage from your own records. A changed GPS distance is recorded as a manual correction for review.",fontSize=13.sp,lineHeight=18.sp)
    }
    if(kind=="expense") FormSection("Receipt",spacing=0.dp) {
        Action("Choose receipt photo",{picker.launch(arrayOf("image/jpeg","image/png","application/pdf"))},false,!attaching,icon=Icons.Default.Image)
        Action("Scan receipt",{scanOpen=true},false,!attaching,icon=Icons.Default.DocumentScanner)
        if(attaching)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Link)
        if(receiptId!=null && receiptId!=expense?.receiptId) TextButton(onClick={
            clearRecognition();receiptId=expense?.receiptId;receiptBytes=null;loadedReceipt=null
        }) {Text("Remove new attachment",color=Danger)}
        receiptBytes?.let {bytes->
            val mime=remember(bytes) {runCatching {validatedDocumentMime(bytes)}.getOrNull()}
            val bitmap by produceState<android.graphics.Bitmap?>(null,receiptId,bytes) {
                if(mime!=null) try {value=receiptRecognitionBitmap(repo.app,bytes,mime)} catch(failure:Exception) {if(failure is CancellationException)throw failure;validation=failure.message}
            }
            Text(if(receiptId==expense?.receiptId) "Existing receipt kept" else if(mime=="application/pdf") "PDF receipt attached" else "Receipt photo attached",color=Link)
            bitmap?.let {Image(it.asImageBitmap(),"Attached receipt preview",Modifier.fillMaxWidth().heightIn(max=240.dp))}
            if(mime!=null) {
                val extension=if(mime=="application/pdf") "pdf" else if(mime=="image/png") "png" else "jpg"
                Action("Preview private receipt",{preview=DocumentPreviewData("Receipt.$extension",bytes,mime)},false)
                TextButton(enabled=!reading && !attaching,onClick={
                    clearRecognition();val run=generation;val id=receiptId;reading=true
                    ocrJob=jobs.launch {
                        try {val text=recognizeReceipt(repo.app,bytes,mime);requireCurrent();if(run==generation && receiptId==id)ocr=text}
                        catch(failure:Exception) {if(failure is CancellationException)throw failure;if(run==generation)validation=failure.message ?: "Text recognition could not finish. Enter the details manually."}
                        finally {if(run==generation)reading=false}
                    }
                }) {Text(if(reading) "Reading receipt…" else "Read receipt on this phone",fontSize=17.sp,color=Pink)}
                Action("Open or share receipt",{edit {requireCurrent();shareBytes(repo,bytes,mime,"receipt.$extension")}},false)
                if(repo.connection!=null && expense?.receiptId==receiptId) {
                    TextButton(onClick={edit {
                        val connection=repo.connection ?: error("Connect to the workspace first.");val id=receiptId ?: error("The receipt is unavailable.")
                        WorkspaceClient(connection).send("receipts/$id","PUT",bytes,mime);requireCurrent()
                        repo.update {it.copy(receipts=it.receipts.map {row->if(row.id==id)row.copy(uploaded=true) else row})};receiptResent=true
                    }}) {Text("Send receipt to firm again",fontSize=17.sp,color=Pink)}
                    if(receiptResent)Text("Your firm received the same receipt again.",color=Muted)
                }
            }
            if(ocr.isNotEmpty()) {
                Text(ocr.take(2500),style=MaterialTheme.typography.bodySmall);Text("Review suggestions before applying them.",color=Muted)
                ocr.lineSequence().firstOrNull {it.isNotBlank()}?.let {merchant->TextButton(onClick={title=merchant.take(160)}) {Text("Use merchant: ${merchant.take(60)}")}}
                Regex("(?:\\$\\s*)?([0-9]{1,6}\\.[0-9]{2})").findAll(ocr).map {it.groupValues[1]}.distinct().take(8).forEach {suggestion->TextButton(onClick={amount=suggestion}) {Text("Use amount: $$suggestion")}}
            }
        }
        Text("Receipt reading stays on this phone. Review suggested details before saving. A multi-page PDF reads suggestions from its first page. Removing a new attachment keeps its saved source file for recovery.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    if(kind=="expense") FormSection(background=Panel,spacing=0.dp) {
        NavigationRow("Business & vehicle details",{detailsExpanded=!detailsExpanded})
        if(detailsExpanded) {
            Field("Business purpose",purpose,{purpose=it.take(500)},true)
            Field("Business use % (optional)",percent,{percent=it})
            if(category=="meals") {
                Field("People and business context",meal,{meal=it.take(500)},true)
                Text("Food during an ordinary workday is not automatically a business deduction. Keep the context for your preparer.",color=Muted)
            }
            Field("Vehicle",vehicle,{vehicle=it.take(80)});Field("Odometer miles (optional)",odometer,{odometer=it})
            Choice("Paid with",payment,linkedMapOf("" to "Not recorded","cash" to "Cash","card" to "Card","bank" to "Bank","platform" to "Deducted from payout","other" to "Other")) {payment=it}
            Field("Place",place,{place=it.take(240)})
        }
    }
    val candidateCents=runCatching {StatementImport.cents(amount)}.getOrNull()
    val similar=kind=="expense" && candidateCents!=null && Expense(date=date,merchant=title,amountCents=candidateCents,currency=currency).hasPossibleDuplicate(repo.journal.visible.map {it.record},original?.id)
    if(similar) Toggle("I checked the similar existing entry",duplicateConfirmed) {duplicateConfirmed=it}
    validation?.let {Text(it,color=Danger)}
    val submit:()->Unit={edit {
        LocalDate.parse(date); val id=original?.id ?: uuid(); val revision=original?.revision ?: 0
        val reference=bank?.reference ?: original?.bankReference
        val record=when(kind) {
            "trip" -> { require(original?.id!=repo.journal.activeTripId) {"End the current drive before editing it."}
                val begin=tripEditedInstant(trip?.startedAt,date,start,zone); val finish=tripEditedInstant(trip?.endedAt,endDate,end,zone); require(finish>=begin) {"End time must follow start time."}
                val recordedMiles=miles.toDouble();require(recordedMiles.isFinite() && recordedMiles in 0.0..6213.0) {"Check the trip distance."};val distance=recordedMiles*1609.344
                fun optionalCents(value: String)=value.takeIf {it.isNotBlank()}?.let {StatementImport.cents(it).also {require(it>=0)}}
                DriverRecord.trip((trip ?: Trip()).copy(startedAt=begin.toString(),endedAt=finish.toString(),distanceMeters=distance,localDate=date,timeZoneId=zone.id,
                    classification=classification,purpose=title,notes=notes,source=if(trip!=null && abs(distance-trip.distanceMeters)<1)trip.source else "manual",
                    earningsCents=if(role=="reposition")0 else optionalCents(fare),platformFeesCents=if(role=="reposition")0 else optionalCents(fees),rideRole=role,platform=platform,workArea=area),id,revision) }
            "expense" -> { val cents=StatementImport.cents(amount); require(cents>0 && title.isNotBlank()) {"Enter a merchant and positive amount."}
                val use=percent.takeIf {it.isNotBlank()}?.toInt()?.also {require(it in 0..100)}; val meter=odometer.takeIf {it.isNotBlank()}?.toDouble()?.also {require(it.isFinite() && it in 0.0..2_000_000.0)}
                DriverRecord.expense(Expense(date,title,category,cents,currency=currency,classification=classification,notes=notes,receiptId=receiptId,businessPurpose=purpose,businessUsePercent=if(classification=="personal")0 else use,mealContext=meal,vehicle=vehicle,odometerMiles=meter,paymentMethod=payment.takeIf {it.isNotBlank()},place=place,bankReference=reference),id,revision) }
            else -> {val cents=StatementImport.cents(amount); require(cents>0 && title.isNotBlank()) {"Enter a description and positive amount."}; DriverRecord.income(Income(date,platform,title,cents,currency=currency,notes=notes,bankReference=reference),id,revision)}
        }
        if(kind=="expense") {
            val duplicates=record.expense().hasPossibleDuplicate(repo.journal.visible.map {it.record},id)
            require(!duplicates || duplicateConfirmed) {"A same-day entry has this amount. Review it, then confirm above if this is a separate purchase."}
        }
        require(bank==null || bank.currency=="USD" && bank.isTestData!=true && bank.ready) {"Only posted US-dollar transactions can be recorded. Test transactions cannot enter your journal."}
        repo.save(record)
        if(prompt!=null) repo.update {it.copy(placePrompts=it.placePrompts.map {p->if(p.id==prompt.id) p.copy(dismissed=true) else p})}
        done()
    }}
    val canSave=!attaching && repo.storageReady && if(kind=="trip") miles.toDoubleOrNull()?.let {it.isFinite() && it in 0.0..6213.0}==true
        else title.isNotBlank() && runCatching {StatementImport.cents(amount)>0}.getOrDefault(false)
    val currentSubmit=rememberUpdatedState(submit)
    val headerSubmit=remember { {currentSubmit.value()} }
    SideEffect {onSaveReady?.invoke(headerSubmit,canSave)}
    DisposableEffect(Unit) {onDispose {onSaveReady?.invoke(null,false)}}
    if(onSaveReady==null) FormSection(spacing=0.dp) {
        TextButton(enabled=canSave,onClick=headerSubmit,modifier=Modifier.fillMaxWidth()) {Text("Save ${if(kind=="trip") "trip" else kind}",fontSize=17.sp,color=if(canSave) Pink else Color(0xFF626266))}
    }
    if(original!=null && repo.journal.entries.any {it.record.id==original.id}) TextButton(onClick={showDelete=true}) {Text("Delete entry")}
    if(showDelete) AlertDialog(onDismissRequest={showDelete=false},title={Text("Delete this entry?")},text={Text("Deletion will sync to the firm. Attached source files remain available for recovery.")},confirmButton={TextButton(onClick={edit {require(original!!.id!=repo.journal.activeTripId);repo.save(original.copy(deleted=true));done()};showDelete=false}) {Text("Delete")}},dismissButton={TextButton(onClick={showDelete=false}) {Text("Keep")}})
    preview?.let {NativeDocumentPreview(repo,it) {preview=null}}
    if(scanOpen)ReceiptScanner(repo,{capture->install(capture)},{scanOpen=false})
}

@Composable private fun RecordFormDivider() {HorizontalDivider(color=Color.White.copy(alpha=.10f),thickness=.5.dp)}
@Composable private fun RecordDateTimeRow(label:String,date:String,time:String,onDate:(String)->Unit,onTime:(String)->Unit) {
    Column {
    Row(Modifier.fillMaxWidth().heightIn(min=52.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)) {
        Text(label,Modifier.weight(1f),fontSize=17.sp)
        Box(Modifier.width(128.dp).height(36.dp).background(Color(0xFF292A30),RoundedCornerShape(50)).padding(horizontal=10.dp)
            .semantics(mergeDescendants=true) {contentDescription="$label date"}) {DateField("",date,onDate)}
        Box(Modifier.width(86.dp).height(36.dp).background(Color(0xFF292A30),RoundedCornerShape(50)).padding(horizontal=10.dp)
            .semantics(mergeDescendants=true) {contentDescription="$label time"}) {TimeField("",time,onTime)}
    }
    RecordFormDivider()
    }
}

fun shareBytes(repo: DriverRepository,bytes: ByteArray,mime: String,name: String) {
    val folder=File(repo.app.cacheDir,"shared").apply {mkdirs()}; val file=File(folder,uuid()+"-"+name); file.writeBytes(bytes)
    val uri=FileProvider.getUriForFile(repo.app,repo.app.packageName+".files",file)
    val send=Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    repo.app.startActivity(Intent.createChooser(send,"Share from Gig Tax Pros").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
