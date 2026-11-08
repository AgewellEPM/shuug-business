package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.R
import java.io.ByteArrayInputStream
import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private fun moneyBand(value: OfferMoneyBand?): String = value?.let {
    if(it.lower==it.upper) usd(it.lower) else "${usd(it.lower)}–${usd(it.upper)}"
} ?: "—"
private fun offerTint(value: ReviewedOfferAssessment) = when(value.outcome) {
    "meetsGoal" -> Income; "loss" -> Color(0xFFFF5D87); "belowGoal" -> ExpenseColor; else -> Color(0xFFFFE66D)
}
private fun offerOutcome(value: ReviewedOfferAssessment) = when(value.outcome) {
    "meetsGoal" -> "Meets your entered pay target"
    "loss" -> "Skip this opportunity"
    "belowGoal" -> "Below your entered pay target"
    else -> "Review before deciding"
}
private fun assessment(repo: DriverRepository, offer: ReviewedGigOffer) = assessReviewedOffer(offer,
    repo.journal.goals.vehicleCostCentsPerMile,repo.journal.goals.targetHourlyCents,repo.journal.taxReservePercent ?: 0.0)
private fun sampleAssessment(offer: ReviewedGigOffer) = assessReviewedOffer(offer,50.0,2000,15.0)

@Composable private fun PlatformHeader(platform: String, trailing: String? = null) {
    val context=LocalContext.current
    val bitmap=remember(platform) {runCatching {context.assets.open("platforms/Platform${platform}Icon.jpg").use {BitmapFactory.decodeStream(it)}}.getOrNull()}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        if(bitmap!=null) Image(bitmap.asImageBitmap(),"$platform app icon",Modifier.size(36.dp))
        val logo=when(platform) {"DoorDash"->R.drawable.platform_doordash_wordmark;"Uber"->R.drawable.platform_uber_wordmark;"Lyft"->R.drawable.platform_lyft_wordmark;"Instacart"->R.drawable.platform_instacart_wordmark;else->R.drawable.platform_spark_wordmark}
        Box(Modifier.weight(1f).height(36.dp)) {
            Image(painterResource(logo),platform,Modifier.width(120.dp).height(30.dp).clipToBounds()
                .background(if(platform=="Spark") Color.White else Color.Transparent)
                .graphicsLayer {if(platform=="Uber") {scaleX=2.6f;scaleY=2.6f}})
        }
        trailing?.let {Text(it,color=Link,fontSize=10.sp,modifier=Modifier.padding(top=10.dp))}
    }
}

@Composable fun OffersInboxScreen(repo: DriverRepository,navigate: (String)->Unit) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
        Column {Text("YOUR NEXT MOVE",color=Link,fontSize=11.sp,fontWeight=FontWeight.SemiBold)
            Text("Incoming offers",fontSize=29.sp,fontWeight=FontWeight.Bold)}
        IconButton(onClick={navigate("Offer settings")},Modifier.testTag("offers.settings")) {Icon(Icons.Default.Tune,"Offer settings and platforms",tint=Pink)}
    }
    Text("Compare observed offers across your gig apps. Availability is checked in the original app.",color=Muted,fontSize=13.sp)
    ScreenshotHelpCard(navigate)
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick={navigate("Offer reader")},Modifier.weight(1f)) {Icon(Icons.Default.DocumentScanner,null);Text("Read an offer")}
        OutlinedButton(onClick={navigate("Enter offer")},Modifier.weight(1f).testTag("offers.enter")) {Icon(Icons.Default.Add,null);Text("Enter")}
    }
    TextButton(onClick={navigate("Capture diagnostics")}) {Icon(Icons.Default.MonitorHeart,null);Text("Offer Capture Diagnostics")}
    val all = reviewedOffers(repo.journal)
    all.firstOrNull {it.isActiveWork()}?.let {active->Panel("Current work") {
        Text("${active.platform} · ${if(active.phase=="accepted") "Accepted" else "Started"} · Your report",color=Route)
        Action("Review active job",{navigate("Offer:${active.id}")},primary=false)
    }}
    if(all.isEmpty()) Panel {
        Icon(Icons.Default.MoreTime,null,tint=Pink,modifier=Modifier.size(34.dp))
        Text("Your next offer starts here.",fontSize=23.sp,fontWeight=FontWeight.Bold)
        Text("Share a screenshot or text, or enter an offer while parked. Missing information stays visible for review.",color=Muted)
        TextButton(onClick={navigate("Sample shift")},Modifier.testTag("offers.sample")) {Text("Explore a sample shift")}
    } else all.forEach { offer -> OfferCard(offer,assessment(repo,offer),false) {navigate("Offer:${offer.id}")} }
    TextButton(onClick={navigate("Sample shift")}) {Text("View simulated multi-platform offers")}
}

@Composable fun ScreenshotHelpCard(navigate: (String)->Unit) {
    Panel("Is this job worth it?") {
        Text("Take a screenshot. Bring it here. Check the pay after costs.",fontWeight=FontWeight.SemiBold)
        Action("Show me how · Try the guide",{navigate("Screenshot guide")})
        Action("Choose screenshot",{navigate("Choose screenshot")},primary=false)
    }
}

@Composable private fun OfferCard(offer: ReviewedGigOffer,value: ReviewedOfferAssessment,sample: Boolean,onClick: ()->Unit) {
    Surface(onClick=onClick,color=Color.Transparent,modifier=Modifier.fillMaxWidth().testTag("offer.card.${offer.platform}")) {
        Panel {
            PlatformHeader(offer.platform,if(sample) "SIMULATED" else "OBSERVED")
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                Text(offer.payoutCents?.let {usd(it)} ?: "Unknown payout",color=Income,fontSize=35.sp,fontWeight=FontWeight.Bold)
                Icon(Icons.Default.ChevronRight,null,tint=Pink)
            }
            Row(horizontalArrangement=Arrangement.spacedBy(24.dp)) {
                Column(Modifier.weight(1f)) {Text(moneyBand(value.cash),color=offerTint(value),fontWeight=FontWeight.Bold);Text("Cash after reserve",color=Muted,fontSize=11.sp)}
                Column(Modifier.weight(1f)) {Text(moneyBand(value.hourly),color=offerTint(value),fontWeight=FontWeight.Bold);Text("Per working hour",color=Muted,fontSize=11.sp)}
            }
            Text(offerOutcome(value),color=offerTint(value),fontWeight=FontWeight.Bold)
            if(value.issues.isNotEmpty()) Text(value.issues.first(),color=Muted,fontSize=12.sp)
            if(!sample) Text(if(offer.fresh()) "Within 60-second review window" else "Older observation · recheck in the gig app",color=Muted,fontSize=11.sp)
        }
    }
}

@Composable fun SampleOffersScreen(repo: DriverRepository,navigate: (String)->Unit) {
    Text("✦ SAMPLE DATA · Your records are separate",color=Link,fontSize=11.sp,fontWeight=FontWeight.Bold)
    Panel("Home · West Hartford") {
        Text("Paused scenario · 5:00 PM → arrive by 6:00 PM",color=Muted,fontSize=12.sp)
        Text("$20/hr cash target · $0.50/mi cost · 15% planning reserve",color=Link,fontSize=12.sp)
        Text("Five observed examples, ranked through the same calculations used by your offer reader. Roads and travel times below are simulated.",color=Muted,fontSize=12.sp)
    }
    sampleOfferJourneys().forEach {example->OfferCard(example.offer,sampleAssessment(example.offer),true) {navigate("Offer:${example.offer.id}")} }
}

@Composable fun ManualOfferScreen(repo: DriverRepository,done: ()->Unit,offerId: String? = null,draft: ReviewedGigOffer? = null) {
    val original = remember(offerId,draft) {draft ?: reviewedOffers(repo.journal).firstOrNull {it.id==offerId} ?: ReviewedGigOffer()}
    val openedScope = remember {repo.scope}
    fun amount(cents: Int?) = cents?.let {String.format(Locale.US,"%.2f",it/100.0)} ?: ""
    var platform by remember(original.id) {mutableStateOf(original.platform)}
    var payout by remember(original.id) {mutableStateOf(amount(original.payoutCents))}
    var guarantee by remember(original.id) {mutableStateOf(amount(original.guaranteedCents))}
    var fees by remember(original.id) {mutableStateOf(amount(original.additionalCostsCents))}
    var miles by remember(original.id) {mutableStateOf(original.totalMiles?.toString() ?: "")}
    var minutes by remember(original.id) {mutableStateOf(original.workingMinutes?.toString() ?: "")}
    var wait by remember(original.id) {mutableStateOf(original.waitMinutes?.toString() ?: "")}
    var reposition by remember(original.id) {mutableStateOf(original.repositionMiles?.toString() ?: "")}
    var pickup by remember(original.id) {mutableStateOf(original.pickup)}
    var dropoff by remember(original.id) {mutableStateOf(original.dropoff)}
    var checked by remember(original.id) {mutableStateOf(original.checked)}
    var error by remember {mutableStateOf<String?>(null)}
    LaunchedEffect(repo.scope) {if(openedScope!=repo.scope) done()}
    if(original.source=="sharedScreenshot") Panel("Read from your picture") {
        Text("Check these against the picture. Fill in the complete job totals below.",color=Muted,fontSize=12.sp)
        original.displayedMiles?.let {OfferLine("Miles shown",it.toString())}
        original.displayedMinutes?.let {OfferLine("Minutes shown",it.toString())}
        Text("These may leave out waiting or unpaid driving.",color=Muted,fontSize=12.sp)
    }
    Panel("Offer visible in your gig app · USD") {
        if(original.source=="manual") Choice("Platform",platform,gigPlatforms) {platform=it}
        else Text("Platform: $platform · selected when captured",color=Muted,fontSize=12.sp)
        Field("Quoted payout",payout,{payout=it})
        Field("Guaranteed part of payout",guarantee,{guarantee=it})
        Text("Include tips in the quote only when the platform includes them. Leave guaranteed pay blank if uncertain; the lower estimate will reflect that.",fontSize=12.sp,color=Muted)
        Field("Additional costs (0 only if known)",fees,{fees=it})
    }
    Panel("Complete working estimates") {
        Field("All working miles",miles,{miles=it});Field("All working minutes",minutes,{minutes=it})
        Text("Include pickup, waiting, delivery and necessary repositioning in the totals. Enter your estimate after reviewing the entire job.",color=Muted,fontSize=12.sp)
        Field("Pickup wait (minutes)",wait,{wait=it});Field("Necessary repositioning miles (0 if none)",reposition,{reposition=it})
    }
    Panel("Locations") {Field("Pickup place or address",pickup,{pickup=it});Field("Drop-off place or address",dropoff,{dropoff=it})
        Text("Confirm the matching map results when comparing the route home.",color=Muted,fontSize=12.sp)}
    Panel {
        Toggle("I checked this offer in its original app",checked,{checked=it})
        Text("This records your review, not a provider availability confirmation. A known expiration is kept.",color=Muted,fontSize=12.sp)
    }
    error?.let {Text(it,color=Color(0xFFFFE66D))}
    Action("Save",{
        try {
            require(openedScope==repo.scope) {"The active account changed. Reopen this offer."}
            fun cash(text: String): Int? = text.trim().takeIf {it.isNotEmpty()}?.let {StatementImport.cents(it).also {value->require(value in 0..100_000_000) {"Check the dollar amounts."}}}
            fun number(text: String,max: Double): Double? = text.trim().takeIf {it.isNotEmpty()}?.let {it.toDouble().also {n->require(n.isFinite() && n in 0.0..max) {"Use valid, nonnegative distance and time estimates."}}}
            val quote=cash(payout);val guaranteed=cash(guarantee)
            require(guaranteed==null || (quote!=null && guaranteed<=quote)) {"Guaranteed pay cannot exceed the quote."}
            val next=original.copy(platform=platform,payoutCents=quote,guaranteedCents=guaranteed,additionalCostsCents=cash(fees),
                totalMiles=number(miles,10000.0),workingMinutes=number(minutes,2880.0),waitMinutes=number(wait,240.0),
                repositionMiles=number(reposition,10000.0),pickup=pickup.trim().take(500),dropoff=dropoff.trim().take(500),
                checked=checked,observedAt=if(checked) now() else original.observedAt)
            repo.update {current->
                val saved=current.saveReviewedOffer(next)
                if(next.source=="sharedScreenshot" && current.observedOffers.none {it.id==next.id}) saved.copy(
                    observedOffers=(saved.observedOffers+ObservedGigOffer(id=next.id,platform=next.platform,
                        source="sharedScreenshot",observedAt=original.observedAt,readerSession=current.offerReader.id,
                        payoutCents=original.payoutCents,miles=original.displayedMiles,minutes=original.displayedMinutes)).takeLast(100))
                else saved
            };done()
        } catch(problem: Exception) {error=problem.message ?: "Check the entered values."}
    },enabled=repo.storageReady)
    Action("Cancel",done,primary=false)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ScreenshotImportScreen(repo: DriverRepository,navigate: (String)->Unit) {
    var platform by remember {mutableStateOf("DoorDash")}
    var scanning by remember {mutableStateOf(false)}
    var draft by remember {mutableStateOf<ReviewedGigOffer?>(null)}
    var problem by remember {mutableStateOf<String?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri->
        if(uri!=null && !scanning) {
            scanning=true;problem=null;val scope=repo.scope;val selectedPlatform=platform
            repo.run {
                try {
                    require(uri.scheme=="content") {"Choose a screenshot through Android's photo picker."}
                    val (bitmap,rotation)=withContext(Dispatchers.IO) {
                        val bytes=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,20*1024*1024)}
                        val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                        require(bounds.outWidth>0 && bounds.outHeight>0 && bounds.outWidth.toLong()*bounds.outHeight<=30_000_000) {"Choose a readable offer screenshot."}
                        var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>1800) sample*=2
                        val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply {inSampleSize=sample}) ?: error("The screenshot could not be read.")
                        val orientation=ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,1)
                        bitmap to when(orientation) {3->180;6->90;8->270;else->0}
                    }
                    val scanner=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                    scanner.process(InputImage.fromBitmap(bitmap,rotation)).addOnSuccessListener {result->
                        if(repo.scope==scope) {
                            val settings=OfferReaderSettings(enabled=true,platform=selectedPlatform,expiresAt=Instant.now().plusSeconds(60).toString())
                            val captured=GigOfferTextReader.read(result.text,settings,"sharedScreenshot")
                            if(captured==null) problem="No reliable offer values were found. You can enter the fields manually."
                            draft=ReviewedGigOffer(platform=selectedPlatform,source="sharedScreenshot",payoutCents=captured?.payoutCents,
                                displayedMiles=captured?.miles,displayedMinutes=captured?.minutes)
                        }
                    }.addOnFailureListener {problem="The screenshot could not be read. Enter the offer manually."}
                        .addOnCompleteListener {bitmap.recycle();scanner.close();scanning=false}
                } catch(error: Exception) {scanning=false;problem=error.message}
            }
        }
    }
    Text("Check a job from a screenshot",fontSize=28.sp,fontWeight=FontWeight.Bold)
    Text("Park first. Pick the gig app, then choose a clear picture of its offer.",color=Muted)
    Choice("Gig app",platform,gigPlatforms) {platform=it}
    Action(if(scanning) "Reading on this phone…" else "Choose screenshot",{picker.launch(arrayOf("image/*"))},enabled=!scanning)
    Text("Only the image you choose is read on this phone. It is not uploaded or kept after reading. Review every field before saving.",color=Muted,fontSize=12.sp)
    Action("Show me how · Try the guide",{navigate("Screenshot guide")},primary=false)
    problem?.let {Text(it,color=Color(0xFFFFE66D))}
    draft?.let {value->ModalBottomSheet(onDismissRequest={draft=null},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
            Text("Review offer fields",fontSize=23.sp,fontWeight=FontWeight.Bold)
            Text("Read from your picture",color=Link)
            Text("Check pay against the picture. Include all working miles and time; visible distance and deadlines may leave out unpaid driving and waiting.",color=Muted)
            ManualOfferScreen(repo,done={draft=null;navigate("Offers")},draft=value)
        }
    }}
}

@Composable fun OfferDetailScreen(repo: DriverRepository,offerId: String,navigate: (String)->Unit) {
    val example=sampleOfferJourneys().firstOrNull {it.offer.id==offerId}
    val offer=example?.offer ?: reviewedOffers(repo.journal).firstOrNull {it.id==offerId}
    if(offer==null) {Text("This offer is no longer available on this phone.");return}
    val value=if(example!=null) sampleAssessment(offer) else assessment(repo,offer)
    PlatformHeader(offer.platform)
    Text(if(example!=null) "SIMULATED OFFER · PAUSED SCENARIO" else "OBSERVED OFFER · RECHECK AVAILABILITY",color=Link,fontSize=12.sp,fontWeight=FontWeight.Bold)
    Text(offer.payoutCents?.let {usd(it)} ?: "Payout unknown",color=Income,fontSize=47.sp,fontWeight=FontWeight.Bold)
    Panel {
        OfferLine("Vehicle operating cost",moneyBand(value.vehicle),ExpenseColor)
        OfferLine("Additional costs",offer.additionalCostsCents?.let {usd(it)} ?: "Unknown",ExpenseColor)
        HorizontalDivider(color=Border.copy(alpha=.3f))
        OfferLine("Profit before reserve",moneyBand(value.profit),offerTint(value))
        OfferLine("Planning reserve (${if(example!=null) 15 else (repo.journal.taxReservePercent ?: 0.0).toInt()}%)",moneyBand(value.reserve),ExpenseColor)
        OfferLine("Estimated available cash",moneyBand(value.cash),offerTint(value))
        OfferLine("Effective hourly earnings",moneyBand(value.hourly),offerTint(value))
        Text("Vehicle costs are counted once. A reserve is money set aside, not a tax calculation. Ranges reflect entered uncertainty.",color=Muted,fontSize=11.sp)
    }
    if(value.issues.isNotEmpty()) Panel("What needs review") {value.issues.forEach {Text(it,color=Color(0xFFFFE66D),fontSize=13.sp)}}
    if(example!=null) {
        Panel(if(example.recommended) "Fits your trip home" else offerOutcome(value)) {
            example.additionalMiles?.let {OfferLine("Miles versus going directly",String.format(Locale.US,"%+.1f to %+.1f mi",it,it),Route)}
            example.additionalMinutes?.let {OfferLine("Additional travel time",String.format(Locale.US,"%+.0f to %+.0f min",it,it),Route)}
            example.arrival?.let {OfferLine("Latest estimated arrival",it,Route)}
            Text(example.reason,color=Muted,fontSize=13.sp)
        }
        Text("All offers, routes and earnings here are examples. Return to your data to analyze a real offer.",color=Muted,fontSize=12.sp)
    } else {
        OfferWorkActions(repo,offer)
        Action("Review extracted fields",{navigate("Review offer:${offer.id}")},primary=false)
        Panel("Compare the full route home") {
            Text("Confirm pickup, drop-off and your final destination. Missing or unverified road travel stays unknown.",color=Muted)
            Text("Pickup: ${offer.pickup.ifBlank {"Not entered"}}")
            Text("Drop-off: ${offer.dropoff.ifBlank {"Not entered"}}")
            Action("Compare pickup, drop-off & route home",{navigate("Offer route:${offer.id}")},primary=false)
            Action("Open route in Maps",{
                if(offer.pickup.isBlank() || offer.dropoff.isBlank()) repo.failure="Enter and confirm pickup and drop-off addresses first."
                else openOfferLink(repo,"https://www.google.com/maps/dir/?api=1&origin=${Uri.encode(offer.pickup)}&destination=${Uri.encode(offer.dropoff)}")
            },primary=false)
        }
        Text("Use the app switcher to return to ${offer.platform} and accept or decline there. Gig Tax Pros records your advice choices locally.",color=Muted,fontSize=13.sp)
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick={repo.run {repo.update {it.saveReviewedOffer(offer.copy(advice="consider"))}}}) {Text("Keep advice")}
            OutlinedButton(onClick={repo.run {repo.update {it.saveReviewedOffer(offer.copy(advice="skipAdvice"))}}}) {Text("Skip advice")}
        }
        offer.advice?.let {Text(if(it=="consider") "Advice saved on this phone." else "Advice skipped. The offer in your gig app is unchanged.",color=Income)}
    }
}

@Composable private fun OfferWorkActions(repo: DriverRepository,offer: ReviewedGigOffer) {
    var requested by remember(repo.scope,offer.id) {mutableStateOf<String?>(null)}
    val openedScope=remember(offer.id) {repo.scope}
    val other=reviewedOffers(repo.journal).firstOrNull {it.id!=offer.id && it.isActiveWork()}
    Panel("Job status") {
        Text(when(offer.phase) {"accepted"->"Accepted in the provider app · Your report";"inProgress","started"->"Job in progress · Your report";"completed"->"Job completed · Your report";"canceled"->"Job canceled · Your report";else->"No job status reported"},fontWeight=FontWeight.SemiBold)
        Text("Report acceptance or cancellation after doing it in the provider app. Record actual earnings and mileage separately.",color=Muted,fontSize=12.sp)
        if(other!=null && offer.phase==null) Text("You reported another active ${other.platform} job. Complete or cancel it here before reporting another acceptance.",color=Caution,fontSize=12.sp)
        if(offer.phase==null) Action("I accepted in the provider app",{requested="accepted"},primary=false,enabled=other==null && repo.storageReady)
        if(offer.phase=="accepted") Action("Job started",{requested="inProgress"},primary=false,enabled=repo.storageReady)
        if(offer.isActiveWork()) {
            Action("Job completed",{requested="completed"},primary=false,enabled=repo.storageReady)
            TextButton(onClick={requested="canceled"},enabled=repo.storageReady) {Text("Job canceled",color=Danger)}
        }
    }
    requested?.let {next->AlertDialog(onDismissRequest={requested=null},title={Text("Confirm your job status")},
        text={Text("This saves your report on this phone. Make any acceptance or cancellation in the provider app first.")},
        confirmButton={TextButton(onClick={requested=null;repo.run {
            require(repo.scope==openedScope) {"Your active account changed. Reopen this job."}
            repo.update {it.reportOfferWork(offer.id,next)}
        }}) {Text("Confirm")}},dismissButton={TextButton(onClick={requested=null}) {Text("Cancel")}})}
}

@Composable private fun OfferLine(title: String,value: String,tint: Color=Color.White) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(title,Modifier.weight(1f));Text(value,color=tint,fontWeight=FontWeight.Bold)
    }
}

private fun openOfferLink(repo: DriverRepository,url: String) {
    try {repo.app.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
    catch(error: Exception) {repo.failure="No app is available to open this link."}
}

@Composable fun OfferPlatformsScreen(repo: DriverRepository,navigate: (String)->Unit) {
    Panel("Copilot mode") {Text("You make the final offer decision",fontWeight=FontWeight.Bold)
        Text("Review recommendations here, then return to the gig app to accept or decline. No provider has an authorized acceptance integration configured.",color=Muted,fontSize=13.sp)}
    Panel("My connected accounts") {Action("Connected jobs & pay",{navigate("Connected work")},primary=false)
        if(repo.connection==null) Text("Connect your invited client account in Your account to manage provider authorizations.",color=Muted)
        else Action("Uber account connection & imported history",{openOfferLink(repo,repo.connection!!.origin+"/#gig-connections")},primary=false)}
    Panel("Check an offer with a screenshot") {Action("Show me how · Try the guide",{navigate("Screenshot guide")});Action("Choose screenshot",{navigate("Choose screenshot")},primary=false)}
    Panel("Gig platforms") {
        Action("Offer Capture Diagnostics",{navigate("Capture diagnostics")},primary=false)
        gigPlatforms.keys.forEach {platform->Column(Modifier.fillMaxWidth().clickable {
            navigate("Offer reader:$platform")
        }.padding(vertical=12.dp)) {
            PlatformHeader(platform)
            Text("Screenshot / shared text · Optional screen sharing",fontSize=12.sp,color=Muted)
            Text(if(platform=="Uber") "Offer reading · Driver account sync through your client profile" else "Offer reading · No authorized account connector configured",fontSize=11.sp,color=Muted)
        }}
    }
    Panel("Costs and reserves") {Action("Vehicle cost & hourly goals",{navigate("Goals")},primary=false)
        Action("Planning reserves & history",{navigate("Planning reserves")},primary=false)
        Text("Offer cash estimates apply your tax reserve to profit after operating costs. Vehicle health savings are a separate allocation and are not charged as another operating cost.",color=Muted,fontSize=13.sp)}
    Panel("Permissions and control") {Action("Offer reading permissions",{navigate("Offer reader")},primary=false)
        Action("Trip & expense alerts",{navigate("Alerts & reminders")},primary=false)
        Text("Shared offers and decisions stay in protected storage on this phone. Full screenshots and transcripts are discarded. Stop reading in Offer reader or use Android's screen-sharing notification to stop sharing.",color=Muted,fontSize=13.sp)}
}

@Composable fun OfferDiagnosticsScreen(repo: DriverRepository,platform: String?=null,navigate: (String)->Unit) {
    if(platform==null) {
        Panel("Check each app separately") {Text("See provider access, captured offers, readable fields and the evidence Shuug needs for advice. Each app has its own results.",color=Muted)}
        gigPlatforms.keys.forEach {name->Panel {
            PlatformHeader(name)
            val captures=repo.journal.observedOffers.filter {it.platform==name}
            Text("Provider: No authorized live-offer connector",color=Muted,fontSize=12.sp)
            Text(if(captures.isEmpty()) "No captured offer saved" else "Offer detected · ${captures.size} saved captures",color=if(captures.isEmpty()) Muted else Route,fontSize=12.sp)
            Text("Shuug: ${if(captures.any {raw->assessment(repo,reviewedOffers(repo.journal).first {it.id==raw.id}).issues.isEmpty()}) "Reviewed financial fields available; route evidence still required" else "more evidence needed"}",color=Color(0xFFFFE66D),fontSize=12.sp)
            Action("View $name diagnostics",{navigate("Capture:$name")},primary=false)
        }}
        Panel("What this verifies") {Text("A saved capture confirms that some visible fields were read under the selected platform. A screenshot's source app and current availability still need your review. Reading one app does not verify another.",color=Muted,fontSize=13.sp)
            Text("Manual offers and sample shifts do not count as detected offers. Full screenshots and screen transcripts are not stored.",color=Muted,fontSize=13.sp)
            Text("Live screen capture and notification access require your explicit Android permission. A simulator or chosen image does not verify another app's live offers.",color=Muted,fontSize=12.sp)}
    } else {
        val capture=repo.journal.observedOffers.filter {it.platform==platform}.maxByOrNull {it.observedAt}
        val reviewed=capture?.let {raw->reviewedOffers(repo.journal).firstOrNull {it.id==raw.id}}
        PlatformHeader(platform)
        Panel("1 · Connection & capture") {
            OfferLine("Provider account","No live-offer connector")
            OfferLine("Reader for this shift",if(repo.journal.offerReader.active() && repo.journal.offerReader.platform==platform) "Enabled for $platform" else "Not selected")
            Text(repo.offerReaderStatus,color=Muted,fontSize=12.sp)
            Text("Android requires an explicit screen-sharing session or selected notification access. Choosing a platform does not grant provider account access.",color=Muted,fontSize=12.sp)
            Action("Test $platform capture",{navigate("Offer reader:$platform")},primary=false)
        }
        Panel("2 · Actual offer detection") {OfferLine("Detected offer",if(capture==null) "None saved" else "Captured fields found")
            capture?.let {OfferLine("Source",it.source);Text("Last captured: ${it.observedAt}",color=Muted,fontSize=12.sp)
                OfferLine("Capture freshness",if(it.fresh()) "Within 60-second review window" else "Stale or expired")
                Text("Detection establishes readable fields, not an authenticated provider connection or an available job.",color=Muted,fontSize=12.sp)} }
        capture?.let {raw->Panel("3 · Fields from the capture") {
            OfferLine("Quoted payout",raw.payoutCents?.let {usd(it)} ?: "Not extracted")
            OfferLine("Miles shown",raw.miles?.toString() ?: "Not extracted")
            OfferLine("Minutes shown",raw.minutes?.toString() ?: "Not extracted")
            Text("These retained values precede your manual edits. Displayed totals do not establish complete working mileage or time.",color=Muted,fontSize=12.sp)
        }}
        Panel("4 · Shuug recommendation") {
            OfferLine("Enough evidence","Needs route and availability review")
            reviewed?.let {current->val value=assessment(repo,current);Text("Estimated cash after reserve: ${moneyBand(value.cash)}",color=offerTint(value))
                value.issues.forEach {Text(it,color=Color(0xFFFFE66D),fontSize=13.sp)}
                Action("Review this offer & its route",{navigate("Offer:${current.id}")},primary=false)}
            Action("Review vehicle cost & hourly target",{navigate("Goals")},primary=false)
            Text("Complete, reviewed fields, fresh road estimates and your costs are required. Estimates can change; accept or decline in the original gig app.",color=Muted,fontSize=12.sp)
        }
    }
}
