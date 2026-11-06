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
    var role by remember { mutableStateOf(trip?.rideRole ?: "ride") }; var platform by remember { mutableStateOf(trip?.platform ?: income?.platform ?: if(kind=="income") "other" else "") }
    var area by remember { mutableStateOf(trip?.workArea ?: "") }
    val zone=trip?.timeZoneId?.let(ZoneId::of) ?: ZoneId.systemDefault()
    fun time(value: String?)=value?.let { Instant.parse(it).atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm")) } ?: ""
    var start by remember { mutableStateOf(time(trip?.startedAt)) }; var end by remember { mutableStateOf(time(trip?.endedAt)) }
    var endDate by remember { mutableStateOf(trip?.endedAt?.let { day(it,zone.id) } ?: date) }
    var duplicateConfirmed by remember { mutableStateOf(false) }; var showDelete by remember { mutableStateOf(false) }
    var receiptBytes by remember { mutableStateOf<ByteArray?>(null) }; var ocr by remember { mutableStateOf("") }; var scanning by remember { mutableStateOf(false) }
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
    Panel(if(kind=="trip") "Trip details" else if(kind=="expense") "Expense details" else "Income details") {
        Field(if(kind=="trip") "Trip purpose" else if(kind=="expense") "Merchant" else "Description",title,{title=it.take(if(kind=="trip") 240 else 160)})
        Field("Date (YYYY-MM-DD)",date,{date=it})
        if(kind!="income") Choice("Classification",classification,classifications) {classification=it}
        if(kind=="trip") {
            Field("Miles",miles,{miles=it}); Field("Start time (HH:mm)",start,{start=it}); Field("End date (YYYY-MM-DD)",endDate,{endDate=it}); Field("End time (HH:mm)",end,{end=it})
            Text("Recorded time zone: ${zone.id}",color=Muted)
            Choice("Drive type",role,linkedMapOf("ride" to "Paid ride","delivery" to "Delivery","reposition" to "Unpaid driving","other" to "Other")) {role=it}
            Field("Fare + tips, before platform fees ($)",fare,{fare=it}); Field("Platform fees ($)",fees,{fees=it})
            Text("Leave unknown amounts empty. Enter 0 when you know there were no fees.",color=Muted)
            Field("Platform",platform,{platform=it.take(80)}); Field("Work area",area,{area=it.take(120)})
        } else {
            Field("Amount ($)",amount,{amount=it})
            if(kind=="income") { Choice("Platform",platform,linkedMapOf("uber" to "Uber","lyft" to "Lyft","doordash" to "DoorDash","instacart" to "Instacart","spark" to "Spark","other" to "Other")) {platform=it}; Text("Check deposits before recording income; transfers and refunds are not automatically earnings.",color=Muted) }
            else {
                Choice("Category",category,expenseCategories) {category=it}
                Field("Business purpose",purpose,{purpose=it.take(500)},true); Field("Business use % (optional)",percent,{percent=it})
                if(category=="meals") { Field("People and business context",meal,{meal=it.take(500)},true); Text("Food during an ordinary workday is not automatically a business deduction. Keep the context for your preparer.",color=Muted) }
                Field("Vehicle",vehicle,{vehicle=it.take(80)}); Field("Odometer miles (optional)",odometer,{odometer=it})
                Choice("Paid with",payment,linkedMapOf("cash" to "Cash","card" to "Card","bank" to "Bank","platform" to "Platform","other" to "Other")) {payment=it}
                Field("Place",place,{place=it.take(240)})
            }
        }
        Field("Notes",notes,{notes=it.take(2000)},true)
        (bank?.reference ?: original?.bankReference)?.let { Text("Source: ${it.accountLabel} · ${it.provider}",color=Muted) }
    }
    if(kind=="expense") Panel("Receipt") {
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick={picker.launch(arrayOf("image/jpeg","image/png","application/pdf"))}) {Text("Choose receipt")}
            OutlinedButton(onClick={try {camera.launch(cameraUri)} catch(_: Exception) {repo.failure="No camera app is available. Choose a receipt file instead."}}) {Text("Camera")}
        }
        receiptBytes?.let { bytes -> val bitmap=remember(bytes) { BitmapFactory.decodeByteArray(bytes,0,bytes.size) }
            if(bitmap!=null) { Image(bitmap.asImageBitmap(),"Attached receipt",Modifier.fillMaxWidth().heightIn(max=300.dp))
                Button(enabled=!scanning,onClick={scanning=true; val scanner=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                    scanner.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener {ocr=it.text}.addOnFailureListener {repo.failure="Text recognition could not finish. Enter the receipt details manually."}.addOnCompleteListener {scanning=false;scanner.close()} }) {Text(if(scanning) "Reading…" else "Read receipt on this phone")} }
            else Text("PDF receipt attached")
            if(ocr.isNotEmpty()) { Text(ocr.take(2500),style=MaterialTheme.typography.bodySmall); Text("Review suggestions before applying them.",color=Muted)
                ocr.lineSequence().firstOrNull { it.isNotBlank() }?.let { merchant->TextButton(onClick={title=merchant.take(160)}) {Text("Use merchant: ${merchant.take(60)}")} }
                Regex("(?:\\$\\s*)?([0-9]{1,6}\\.[0-9]{2})").findAll(ocr).map {it.groupValues[1]}.distinct().take(8).forEach { suggestion->TextButton(onClick={amount=suggestion}) {Text("Use amount: $$suggestion")} }
            }
            OutlinedButton(onClick={repo.run { shareBytes(repo,bytes,if(bitmap==null) "application/pdf" else "image/jpeg",if(bitmap==null) "receipt.pdf" else "receipt.jpg") }}) {Text("Open or share receipt")}
        }
    }
    Toggle("I checked any similar existing entry",duplicateConfirmed) {duplicateConfirmed=it}
    Button(onClick={repo.run {
        val parsedDate=LocalDate.parse(date); val id=original?.id ?: uuid(); val revision=original?.revision ?: 0
        val reference=bank?.reference ?: original?.bankReference
        val record=when(kind) {
            "trip" -> { require(original?.id!=repo.journal.activeTripId) {"End the current drive before editing it."}
                val begin=parsedDate.atTime(LocalTime.parse(start)).atZone(zone).toInstant(); val finish=LocalDate.parse(endDate).atTime(LocalTime.parse(end)).atZone(zone).toInstant(); require(finish>=begin) {"End time must follow start time."}
                val distance=miles.toDouble()*1609.344; require(distance.isFinite() && distance in 0.0..10_000_000.0) {"Check the trip distance."}
                fun optionalCents(value: String)=value.takeIf {it.isNotBlank()}?.let {StatementImport.cents(it).also {require(it>=0)}}
                DriverRecord.trip((trip ?: Trip()).copy(startedAt=begin.toString(),endedAt=finish.toString(),distanceMeters=distance,localDate=date,timeZoneId=zone.id,
                    classification=classification,purpose=title,notes=notes,earningsCents=optionalCents(fare),platformFeesCents=optionalCents(fees),rideRole=role,platform=platform,workArea=area),id,revision) }
            "expense" -> { val cents=StatementImport.cents(amount); require(cents>0 && title.isNotBlank()) {"Enter a merchant and positive amount."}
                val use=percent.takeIf {it.isNotBlank()}?.toInt()?.also {require(it in 0..100)}; val meter=odometer.takeIf {it.isNotBlank()}?.toDouble()?.also {require(it.isFinite() && it in 0.0..2_000_000.0)}
                DriverRecord.expense(Expense(date,title,category,cents,classification=classification,notes=notes,receiptId=receiptId,businessPurpose=purpose,businessUsePercent=use,mealContext=meal,vehicle=vehicle,odometerMiles=meter,paymentMethod=payment,place=place,bankReference=reference),id,revision) }
            else -> {val cents=StatementImport.cents(amount); require(cents>0 && title.isNotBlank()) {"Enter a description and positive amount."}; DriverRecord.income(Income(date,platform,title,cents,notes=notes,bankReference=reference),id,revision)}
        }
        if(kind!="trip") {
            val cost=if(kind=="expense") record.expense().amountCents else record.income().amountCents
            val duplicates=repo.journal.visible.any {it.record.id!=id && it.record.kind==kind && it.record.date==date && (if(kind=="expense") it.record.expense().amountCents else it.record.income().amountCents)==cost}
            require(!duplicates || duplicateConfirmed) {"A same-day entry has this amount. Review it, then confirm above if this is a separate purchase."}
        }
        require(bank==null || bank.currency=="USD" && bank.isTestData!=true && bank.ready) {"Only posted US-dollar transactions can be recorded. Test transactions cannot enter your journal."}
        repo.save(record)
        if(prompt!=null) repo.update {it.copy(placePrompts=it.placePrompts.map {p->if(p.id==prompt.id) p.copy(dismissed=true) else p})}
        done()
    }},Modifier.fillMaxWidth()) {Text("Save ${if(kind=="trip") "trip" else kind}")}
    if(original!=null && repo.journal.entries.any {it.record.id==original.id}) TextButton(onClick={showDelete=true}) {Text("Delete entry")}
    if(showDelete) AlertDialog(onDismissRequest={showDelete=false},title={Text("Delete this entry?")},text={Text("Deletion will sync to the firm. Attached source files remain available for recovery.")},confirmButton={TextButton(onClick={repo.run {require(original!!.id!=repo.journal.activeTripId);repo.save(original.copy(deleted=true));done()};showDelete=false}) {Text("Delete")}},dismissButton={TextButton(onClick={showDelete=false}) {Text("Keep")}})
}

fun shareBytes(repo: DriverRepository,bytes: ByteArray,mime: String,name: String) {
    val folder=File(repo.app.cacheDir,"shared").apply {mkdirs()}; val file=File(folder,uuid()+"-"+name); file.writeBytes(bytes)
    val uri=FileProvider.getUriForFile(repo.app,repo.app.packageName+".files",file)
    val send=Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    repo.app.startActivity(Intent.createChooser(send,"Share from Rideshare Tax Pros").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
