package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.io.File
import java.time.*
import java.time.format.DateTimeFormatter
import kotlin.math.abs

@Composable fun RecordEditor(repo: DriverRepository,original: DriverRecord?,bank: BankTransaction?,prompt: ExpensePrompt?,done: ()->Unit) {
    val kind=original?.kind ?: if((bank?.amountCents ?: 1)<0) "income" else "expense"
    val expense=original?.takeIf { kind=="expense" }?.expense(); val income=original?.takeIf { kind=="income" }?.income(); val trip=original?.takeIf { kind=="trip" }?.trip()
    var title by remember { mutableStateOf(original?.title?.takeIf { original.kind!="trip" } ?: trip?.purpose ?: bank?.merchant ?: prompt?.merchant ?: "") }
    var date by remember { mutableStateOf(original?.date ?: bank?.date ?: today()) }
    var amount by remember { mutableStateOf((expense?.amountCents ?: income?.amountCents ?: bank?.amountCents?.let(::abs))?.takeIf { it>0 }?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var classification by remember { mutableStateOf(expense?.classification ?: trip?.classification ?: "unclassified") }
    var category by remember { mutableStateOf(expense?.category ?: bank?.suggestedCategory ?: prompt?.category ?: "other") }
    var notes by remember { mutableStateOf(expense?.notes ?: income?.notes ?: trip?.notes ?: "") }
    var purpose by remember { mutableStateOf(expense?.businessPurpose ?: "") }; var percent by remember { mutableStateOf(expense?.businessUsePercent?.toString() ?: "") }
    var meal by remember { mutableStateOf(expense?.mealContext ?: "") }; var vehicle by remember { mutableStateOf(expense?.vehicle ?: "") }
    var odometer by remember { mutableStateOf(expense?.odometerMiles?.toString() ?: "") }; var payment by remember { mutableStateOf(expense?.paymentMethod ?: "other") }
    var place by remember { mutableStateOf(expense?.place ?: prompt?.address ?: "") }; var receiptId by remember { mutableStateOf(expense?.receiptId) }
    var miles by remember { mutableStateOf(trip?.let { "%.3f".format(java.util.Locale.US,it.distanceMeters/1609.344) } ?: "") }
    var fare by remember { mutableStateOf(trip?.earningsCents?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var fees by remember { mutableStateOf(trip?.platformFeesCents?.let { "%.2f".format(java.util.Locale.US,it/100.0) } ?: "") }
    var role by remember { mutableStateOf(trip?.rideRole ?: "other") }; var platform by remember { mutableStateOf(trip?.platform ?: income?.platform ?: if(kind=="income") "uber" else "") }
    var area by remember { mutableStateOf(trip?.workArea ?: "") }
    val zone=trip?.timeZoneId?.let(ZoneId::of) ?: if(trip!=null) ZoneOffset.UTC else ZoneId.systemDefault()
    fun time(value: String?)=value?.let { Instant.parse(it).atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm")) } ?: ""
    var start by remember { mutableStateOf(time(trip?.startedAt)) }; var end by remember { mutableStateOf(time(trip?.endedAt)) }
    var endDate by remember { mutableStateOf(trip?.endedAt?.let { day(it,zone.id) } ?: date) }
    var duplicateConfirmed by remember { mutableStateOf(false) }; var showDelete by remember { mutableStateOf(false) }
    var receiptBytes by remember { mutableStateOf<ByteArray?>(null) }; var ocr by remember { mutableStateOf("") }; var scanning by remember { mutableStateOf(false) }
    var receiptResent by remember { mutableStateOf(false) }; var detailsExpanded by remember {mutableStateOf(false)}
    var preview by remember {mutableStateOf<DocumentPreviewData?>(null)}
    val currency=expense?.currency ?: income?.currency ?: "USD"
    fun attach(uri: Uri) { repo.run {
        val mime=repo.app.contentResolver.getType(uri) ?: "image/jpeg"; require(mime in listOf("image/jpeg","image/png","application/pdf")) { "Choose a JPEG, PNG or PDF receipt." }
        val bytes=repo.app.contentResolver.openInputStream(uri)!!.use { boundedRead(it,5*1024*1024) }
        if(mime!="application/pdf") require(BitmapFactory.decodeByteArray(bytes,0,bytes.size)!=null) { "The receipt image cannot be opened." }
        receiptId=repo.addReceipt(bytes,mime).id; receiptBytes=bytes
    } }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(::attach) }
    val cameraFile=remember { File(File(repo.app.cacheDir,"shared").apply { mkdirs() },"capture-${uuid()}.jpg") }
    val cameraUri=remember { FileProvider.getUriForFile(repo.app,repo.app.packageName+".files",cameraFile) }
    val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { if(it) { attach(cameraUri) } }
    LaunchedEffect(receiptId) { receiptId?.let { repo.run { receiptBytes=repo.receipt(it) } } }
    Panel(if(kind=="trip") "Trip" else if(kind=="expense") "Expense" else "Income") {
        if(kind=="trip") {
            DateField("Start date",date) {date=it};TimeField("Start time",start) {start=it}
            DateField("End date",endDate) {endDate=it};TimeField("End time",end) {end=it}
            Field("Miles",miles,{miles=it})
            Choice("Classification",classification,classifications) {classification=it}
            Field("Purpose",title,{title=it.take(240)})
        } else {
            Field(if(kind=="expense") "Merchant" else "Description",title,{title=it.take(160)})
            Field("Amount · $currency (12.34)",amount,{amount=it})
            DateField("Date",date) {date=it}
            if(kind=="expense") {
                Choice("Category",category,expenseCategories) {category=it}
                Choice("Classification",classification,classifications) {classification=it}
            } else Choice("Platform",platform,linkedMapOf("uber" to "Uber / Uber Eats","lyft" to "Lyft","doordash" to "DoorDash","instacart" to "Instacart","spark" to "Spark","other" to "Other gig work")) {platform=it}
        }
        Field("Notes",notes,{notes=it.take(2000)},true)
        (bank?.reference ?: original?.bankReference)?.let { Text("Source: ${it.accountLabel} · ${it.provider}",color=Muted) }
    }
    if(kind=="trip") Panel("Ride earnings · optional") {
        Choice("Drive type",role,linkedMapOf("ride" to "Passenger ride","delivery" to "Delivery","shopping" to "In-store shopping","reposition" to "Driving without a paid ride","other" to "Other / review")) {role=it}
        Field("Fare + tips before fees · USD",fare,{fare=it});Field("Platform fees · USD (0 if none)",fees,{fees=it})
        Field("Platform (Uber, Lyft…)",platform,{platform=it.take(80)});Field("Work area / neighborhood",area,{area=it.take(120)})
        Text("Use the actual ride breakdown. If you enter take-home pay after fees, enter 0 for fees so they are not subtracted twice. A bank payout is not an individual ride fare. Leave unknown values blank.",color=Muted)
        Text("To analyze pickup and unpaid travel, save those legs as Driving without a paid ride. Automatically detected drives may contain multiple rides; split or correct them using your platform records.",color=Muted)
        Text("Times use ${zone.id}. Enter observed mileage from your own records. A changed GPS distance is recorded as a manual correction for review.",color=Muted)
    }
    if(kind=="expense") Panel("Receipt") {
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick={picker.launch(arrayOf("image/jpeg","image/png","application/pdf"))}) {Text("Choose receipt photo")}
            OutlinedButton(onClick={try {camera.launch(cameraUri)} catch(_: Exception) {repo.failure="No camera app is available. Choose a receipt file instead."}}) {Text("Scan receipt")}
        }
        receiptBytes?.let { bytes -> val bitmap=remember(bytes) { BitmapFactory.decodeByteArray(bytes,0,bytes.size) }
            Action("Preview private receipt",{repo.run {preview=DocumentPreviewData("Receipt",bytes,validatedDocumentMime(bytes))}},false)
            if(bitmap!=null) { Image(bitmap.asImageBitmap(),"Attached receipt",Modifier.fillMaxWidth().heightIn(max=300.dp))
                Button(enabled=!scanning,onClick={scanning=true; val scanner=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                    scanner.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener {ocr=it.text}.addOnFailureListener {repo.failure="Text recognition could not finish. Enter the receipt details manually."}.addOnCompleteListener {scanning=false;scanner.close()} }) {Text(if(scanning) "Reading…" else "Read receipt on this phone")} }
            else Text("PDF receipt attached")
            if(ocr.isNotEmpty()) { Text(ocr.take(2500),style=MaterialTheme.typography.bodySmall); Text("Review suggestions before applying them.",color=Muted)
                ocr.lineSequence().firstOrNull { it.isNotBlank() }?.let { merchant->TextButton(onClick={title=merchant.take(160)}) {Text("Use merchant: ${merchant.take(60)}")} }
                Regex("(?:\\$\\s*)?([0-9]{1,6}\\.[0-9]{2})").findAll(ocr).map {it.groupValues[1]}.distinct().take(8).forEach { suggestion->TextButton(onClick={amount=suggestion}) {Text("Use amount: $$suggestion")} }
            }
            OutlinedButton(onClick={repo.run { shareBytes(repo,bytes,if(bitmap==null) "application/pdf" else "image/jpeg",if(bitmap==null) "receipt.pdf" else "receipt.jpg") }}) {Text("Open or share receipt")}
            if(repo.connection!=null && original?.kind=="expense" && original.expense().receiptId==receiptId) {
                OutlinedButton(onClick={repo.run {
                    val connection=repo.connection ?: error("Connect to the workspace first."); val namespace=repo.scope
                    val mime=when {
                        bytes.size>=8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))->"image/png"
                        bytes.size>=3 && bytes[0]==0xff.toByte() && bytes[1]==0xd8.toByte() && bytes[2]==0xff.toByte()->"image/jpeg"
                        bytes.size>=5 && bytes.copyOfRange(0,5).toString(Charsets.US_ASCII)=="%PDF-"->"application/pdf"
                        else->error("The local receipt format is not supported.")
                    }
                    WorkspaceClient(connection).send("receipts/$receiptId","PUT",bytes,mime)
                    check(repo.scope==namespace) {"Your account changed. Open the correct account to check the receipt."}
                    repo.update {it.copy(receipts=it.receipts.map {row->if(row.id==receiptId) row.copy(uploaded=true) else row})}
                    receiptResent=true
                }}) {Text("Send receipt to firm again")}
                if(receiptResent) Text("Your firm received the same receipt again.",color=Muted)
            }
        }
    }
    if(kind=="expense") Panel {
        NavigationRow("Business & vehicle details",{detailsExpanded=!detailsExpanded})
        if(detailsExpanded) {
            Field("Business purpose",purpose,{purpose=it.take(500)},true)
            Field("Business use % (optional)",percent,{percent=it})
            if(category=="meals") {
                Field("People and business context",meal,{meal=it.take(500)},true)
                Text("Food during an ordinary workday is not automatically a business deduction. Keep the context for your preparer.",color=Muted)
            }
            Field("Vehicle",vehicle,{vehicle=it.take(80)});Field("Odometer miles (optional)",odometer,{odometer=it})
            Choice("Paid with",payment,linkedMapOf("cash" to "Cash","card" to "Card","bank" to "Bank","platform" to "Platform","other" to "Other")) {payment=it}
            Field("Place",place,{place=it.take(240)})
        }
    }
    val candidateCents=runCatching {StatementImport.cents(amount)}.getOrNull()
    val similar=kind=="expense" && candidateCents!=null && Expense(date=date,merchant=title,amountCents=candidateCents,currency=currency).hasPossibleDuplicate(repo.journal.visible.map {it.record},original?.id)
    if(similar) Toggle("I checked the similar existing entry",duplicateConfirmed) {duplicateConfirmed=it}
    Button(onClick={repo.run {
        val parsedDate=LocalDate.parse(date); val id=original?.id ?: uuid(); val revision=original?.revision ?: 0
        val reference=bank?.reference ?: original?.bankReference
        val record=when(kind) {
            "trip" -> { require(original?.id!=repo.journal.activeTripId) {"End the current drive before editing it."}
                val begin=parsedDate.atTime(LocalTime.parse(start)).atZone(zone).toInstant(); val finish=LocalDate.parse(endDate).atTime(LocalTime.parse(end)).atZone(zone).toInstant(); require(finish>=begin) {"End time must follow start time."}
                val recordedMiles=miles.toDouble();require(recordedMiles.isFinite() && recordedMiles in 0.0..6213.0) {"Check the trip distance."};val distance=recordedMiles*1609.344
                fun optionalCents(value: String)=value.takeIf {it.isNotBlank()}?.let {StatementImport.cents(it).also {require(it>=0)}}
                DriverRecord.trip((trip ?: Trip()).copy(startedAt=begin.toString(),endedAt=finish.toString(),distanceMeters=distance,localDate=date,timeZoneId=zone.id,
                    classification=classification,purpose=title,notes=notes,source=if(trip!=null && abs(distance-trip.distanceMeters)<1)trip.source else "manual",
                    earningsCents=if(role=="reposition")0 else optionalCents(fare),platformFeesCents=if(role=="reposition")0 else optionalCents(fees),rideRole=role,platform=platform,workArea=area),id,revision) }
            "expense" -> { val cents=StatementImport.cents(amount); require(cents>0 && title.isNotBlank()) {"Enter a merchant and positive amount."}
                val use=percent.takeIf {it.isNotBlank()}?.toInt()?.also {require(it in 0..100)}; val meter=odometer.takeIf {it.isNotBlank()}?.toDouble()?.also {require(it.isFinite() && it in 0.0..2_000_000.0)}
                DriverRecord.expense(Expense(date,title,category,cents,currency=currency,classification=classification,notes=notes,receiptId=receiptId,businessPurpose=purpose,businessUsePercent=use,mealContext=meal,vehicle=vehicle,odometerMiles=meter,paymentMethod=payment,place=place,bankReference=reference),id,revision) }
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
    }},Modifier.fillMaxWidth()) {Text("Save ${if(kind=="trip") "trip" else kind}")}
    if(original!=null && repo.journal.entries.any {it.record.id==original.id}) TextButton(onClick={showDelete=true}) {Text("Delete entry")}
    if(showDelete) AlertDialog(onDismissRequest={showDelete=false},title={Text("Delete this entry?")},text={Text("Deletion will sync to the firm. Attached source files remain available for recovery.")},confirmButton={TextButton(onClick={repo.run {require(original!!.id!=repo.journal.activeTripId);repo.save(original.copy(deleted=true));done()};showDelete=false}) {Text("Delete")}},dismissButton={TextButton(onClick={showDelete=false}) {Text("Keep")}})
    preview?.let {NativeDocumentPreview(repo,it) {preview=null}}
}

fun shareBytes(repo: DriverRepository,bytes: ByteArray,mime: String,name: String) {
    val folder=File(repo.app.cacheDir,"shared").apply {mkdirs()}; val file=File(folder,uuid()+"-"+name); file.writeBytes(bytes)
    val uri=FileProvider.getUriForFile(repo.app,repo.app.packageName+".files",file)
    val send=Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    repo.app.startActivity(Intent.createChooser(send,"Share from Gig Tax Pros").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
