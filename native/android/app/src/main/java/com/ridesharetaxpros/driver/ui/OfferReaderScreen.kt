package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.offers.*
import java.time.Instant

@Composable fun OfferReaderScreen(repo: DriverRepository,startingPlatform:String?=null) {
    var platform by remember {mutableStateOf(startingPlatform ?: repo.journal.offerReader.platform)}
    var fees by remember {mutableStateOf(repo.journal.offerReader.feesCents?.let {"%.2f".format(java.util.Locale.US,it/100.0)} ?: "")}
    var wait by remember {mutableStateOf(repo.journal.offerReader.waitMinutes?.toString() ?: "")}
    var installed by remember {mutableStateOf<Map<String,String>>(emptyMap())}
    var selected by remember {mutableStateOf("")}
    var mapped by remember {mutableStateOf(repo.journal.offerReader.appPlatforms)}
    val notifications=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {allowed->if(!allowed) repo.offerReaderStatus="Offer alerts are off. Enable notifications in Android Settings."}
    val screen=rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {result->
        if(result.resultCode==Activity.RESULT_OK && result.data!=null) {
            try {ContextCompat.startForegroundService(repo.app,Intent(repo.app,OfferScreenService::class.java)
                .putExtra("projectionResult",result.resultCode).putExtra("projectionData",result.data))}
            catch(error: Exception) {repo.failure=error.message}
        } else repo.offerReaderStatus="Screen sharing was not started. Screenshot import remains available."
    }
    val photo=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri->if(uri!=null) OfferScreenshot.read(repo,uri)}
    LaunchedEffect(Unit) {
        val pm=repo.app.packageManager
        installed=pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
            .filter {it.activityInfo.packageName!=repo.app.packageName}
            .associate {it.activityInfo.packageName to it.loadLabel(pm).toString()}.toList().sortedBy {it.second}.toMap()
    }
    Panel("Should I take this job?") {
        Text("Read the visible offer, check estimated net pay, and make the actual Accept/Decline decision in your gig app.")
        Text("Only selected gig-app notifications or explicitly shared screens/images are read. Screen images and full transcripts are not saved or uploaded. No accessibility control or automatic taps are used.",color=Muted)
    }
    Panel("Your offer assumptions") {
        Choice("Platform on shared screen",platform,gigPlatforms) {platform=it}
        Field("Fee estimate per offer ($; 0 only if known)",fees,{fees=it})
        Field("Expected pickup wait in minutes",wait,{wait=it})
        Text("Set your hourly goal and vehicle cost in Insights. These fee/wait estimates apply to selected apps; verify each offer’s actual total miles, time and fees.",color=Muted)
        if(installed.isEmpty()) Text("No other launchable apps were found. Screenshot import still works.")
        else {
            Choice("Installed gig app",selected,linkedMapOf("" to "Choose an app").apply {putAll(installed)}) {selected=it}
            OutlinedButton(enabled=selected.isNotBlank(),onClick={mapped=mapped+(selected to platform)}) {Text("Read this app as $platform")}
        }
        mapped.forEach { (pkg,brand)->Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Text("${installed[pkg] ?: brand} → $brand",Modifier.weight(1f));TextButton(onClick={mapped=mapped-pkg}) {Text("Remove")}
        } }
        Button(onClick={repo.run {
            val fee=fees.takeIf {it.isNotBlank()}?.let {StatementImport.cents(it).also {value->require(value>=0)}}
            val delay=wait.takeIf {it.isNotBlank()}?.toDouble()?.also {require(it.isFinite() && it in 0.0..240.0)}
            repo.app.stopService(Intent(repo.app,OfferScreenService::class.java))
            repo.update {it.copy(offerReader=OfferReaderSettings(enabled=true,platform=platform,appPlatforms=mapped,
                feesCents=fee,waitMinutes=delay,expiresAt=Instant.now().plusSeconds(4*3600).toString()))}
            repo.offerReaderStatus="Reader ready for this shift. Enable system access or share a screenshot."
            if(Build.VERSION.SDK_INT>=33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }}) {Text("Enable or update reader for this shift")}
        if(repo.journal.offerReader.active()) TextButton(onClick={repo.run {
            repo.update {it.copy(offerReader=it.offerReader.copy(enabled=false))}
            repo.app.stopService(Intent(repo.app,OfferScreenService::class.java));repo.offerReaderStatus="Offer reading is off."
        }}) {Text("Stop offer reading")}
    }
    Panel("System access") {
        Text("Notification access can read only the details the selected gig app actually includes. You choose whether to grant it in Android Settings.",color=Muted)
        OutlinedButton(onClick={repo.app.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}) {Text("Choose notification access")}
        Text("Screen sharing requires Android’s approval each session. If offered, select one gig app rather than the whole screen. Stop sharing before opening private apps.",color=Muted)
        Button(enabled=repo.journal.offerReader.active(),onClick={screen.launch(repo.app.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())}) {Text("Share screen to read visible offers")}
        OutlinedButton(enabled=repo.journal.offerReader.active(),onClick={photo.launch(arrayOf("image/*"))}) {Text("Choose an offer screenshot")}
        Text("You can also share an image directly to Gig Tax Pros from Android’s share sheet. Screenshots may show expired offers.",color=Muted)
        Text(repo.offerReaderStatus)
    }
    Panel("Offers seen on this phone") {
        if(repo.journal.observedOffers.isEmpty()) Text("Readable offers will appear here. Missing details stay unknown.")
        repo.journal.observedOffers.takeLast(20).reversed().forEach {offer->
            Text("${offer.platform} · ${offer.payoutCents?.let {usd(it)} ?: "Payout unknown"}",style=MaterialTheme.typography.titleMedium)
            Text("${offer.miles?.let {"$it mi shown"} ?: "Miles unknown"} · ${offer.minutes?.let {"$it min shown"} ?: "Time unknown"}")
            offer.estimate(repo.journal.offerReader,repo.journal.goals)?.let {estimate->
                Text("${usd(estimate.netCents)} estimated net · ${usd(estimate.hourlyCents)}/active hour")
                Text(if(estimate.meetsGoal) "Meets your pay target; destination impact unknown." else "Below your entered pay target.",color=Muted)
                OutlinedButton(enabled=offer.fresh() && offer.comparisonSavedAt==null,onClick={repo.run {OfferAlerts.confirm(repo,offer.id,repo.scope,offer.readerSession)}}) {Text("Confirm total miles/time & save comparison")}
            }
            if(offer.comparisonSavedAt!=null) Text("Saved comparison · no gig accepted or earnings posted",color=Muted)
            else if(!offer.fresh()) Text("Older than 60 seconds. Check the current offer in its app.",color=Muted)
        }
    }
}
