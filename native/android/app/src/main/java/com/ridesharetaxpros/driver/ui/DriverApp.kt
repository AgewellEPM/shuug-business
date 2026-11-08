package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.tracking.DriveService

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DriverApp(repo: DriverRepository) {
    var tab by rememberSaveable { mutableStateOf("Home") }
    var stack by rememberSaveable { mutableStateOf(listOf<String>()) }
    var serviceAction by rememberSaveable {mutableStateOf("START")}
    var driveClass by rememberSaveable {mutableStateOf("unclassified")}
    var drivePurpose by rememberSaveable {mutableStateOf("")}
    val preferences=remember {repo.app.getSharedPreferences("onboarding",0)}
    var tourSeen by rememberSaveable {mutableStateOf(preferences.getBoolean("gettingStartedSeen",false))}
    fun navigate(route:String) {stack=stack+route}
    fun back() {stack=stack.dropLast(1)}
    fun endDrive() {repo.run {
        repo.endDrive()
        if(!repo.journal.assistance.automaticDrives && !repo.journal.assistance.placeReminders) repo.app.stopService(Intent(repo.app,DriveService::class.java))
        else ContextCompat.startForegroundService(repo.app,Intent(repo.app,DriveService::class.java).setAction("STOP"))
    }}
    val permissions=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted->
        if(granted[Manifest.permission.ACCESS_FINE_LOCATION]==true) try {
            ContextCompat.startForegroundService(repo.app,Intent(repo.app,DriveService::class.java).setAction(serviceAction)
                .putExtra("classification",driveClass).putExtra("purpose",drivePurpose))
        } catch(error:Exception) {repo.failure=error.message}
        else repo.failure="Precise location is needed to measure miles. Manual trips are available."
    }
    fun tracking(action:String) {
        serviceAction=action
        permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION)+
            if(Build.VERSION.SDK_INT>=33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray())
    }
    LaunchedEffect(repo.requestedOfferReader) {if(repo.requestedOfferReader) {navigate("Offers");repo.requestedOfferReader=false}}
    LaunchedEffect(Unit) {if(!tourSeen) navigate("Getting started")}
    val page=stack.lastOrNull()
    BackHandler(stack.isNotEmpty()) {back()}
    val title=when {
        page==null->when(tab) {"Position"->"Positioning";else->tab}
        page.startsWith("Offer:")->"Offer details"
        page.startsWith("Offer route:")->"Offer route home"
        page.startsWith("Review offer:")->"Review offer fields"
        page.startsWith("Capture:")->page.substringAfter(':')
        page.startsWith("Trip:")->"Trip details"
        page.startsWith("Trip routes:")->"Current route options"
        page.startsWith("Money record:")->"Your record"
        page.startsWith("Add rating:")->"Add rating"
        page.startsWith("Add review:")->"Add review"
        page.startsWith("Ratings & reviews:")->"Ratings & reviews"
        page.startsWith("Edit:")->"Edit record"
        page.startsWith("Prompt:")->"Add expense"
        page.startsWith("Bank:")->"Review transaction"
        else->page
    }
    BrandTheme {Scaffold(containerColor=Ink,topBar={if(page!=null || tab!="Home") {
        CenterAlignedTopAppBar(title={Text(title,style=MaterialTheme.typography.titleMedium)},
            colors=TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor=Ink),
            navigationIcon={if(page!=null) IconButton(onClick={back()}) {Icon(Icons.Default.ArrowBack,"Back")}},
            actions={if(page!=null) TextButton(onClick={
                if(page=="Getting started") {preferences.edit().putBoolean("gettingStartedSeen",true).apply();tourSeen=true}
                stack=emptyList()
            }) {Text(if(page=="Getting started" && !tourSeen) "Skip for now" else "Done",color=Pink)}})
    }},bottomBar={if(page==null) {
        Row(Modifier.fillMaxWidth().padding(horizontal=8.dp,vertical=6.dp).navigationBarsPadding().height(64.dp)
            .clip(RoundedCornerShape(50)).background(Brush.verticalGradient(listOf(Color(0xEE24212E),Color(0xE93F174F))))
            .border(1.dp,Border.copy(alpha=.55f),RoundedCornerShape(50)),verticalAlignment=Alignment.CenterVertically) {
            listOf("Home" to Icons.Default.Home,"Offers" to Icons.Default.Bolt,"Go Home" to Icons.Default.Navigation,
                "Position" to Icons.Default.MyLocation,"Earnings" to Icons.Default.BarChart).forEach { (name,icon)->
                Column(Modifier.weight(1f).fillMaxHeight().padding(3.dp).clip(RoundedCornerShape(50))
                    .background(if(tab==name)Color.White.copy(alpha=.14f) else Color.Transparent)
                    .selectable(tab==name,role=Role.Tab,onClick={tab=name}),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
                    Icon(icon,null,Modifier.size(29.dp),tint=Color.White.copy(alpha=if(tab==name)1f else .8f))
                    Text(name,fontSize=11.sp,color=Color.White.copy(alpha=if(tab==name)1f else .72f))
                }
            }
        }
    }}) {padding->
        key(repo.scope,page ?: tab) {
            if(page=="Screenshot guide") Box(Modifier.padding(padding).fillMaxSize()) {ScreenshotGuideScreen(::navigate,::back)}
            else if(page=="Tax & Goals") Box(Modifier.padding(padding).fillMaxSize()) {TaxCoachScreen(repo,::navigate)}
            else Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=16.dp,vertical=10.dp),
                verticalArrangement=Arrangement.spacedBy(14.dp)) {
                if(!repo.storageReady) Panel("Recording unavailable") {Text(repo.failure ?: "Storage is unavailable.")}
                else when {
                    page==null->when(tab) {
                        "Home"->HomeDashboard(repo,::navigate,{tab=it},::endDrive)
                        "Offers"->OffersInboxScreen(repo,::navigate)
                        "Go Home"->MissionScreen(repo,::navigate)
                        "Position"->PositionScreen(repo)
                        "Earnings"->InsightsScreen(repo,{navigate("Goals")},{navigate("Trip:${it.id}")})
                    }
                    page=="Getting started"->GettingStartedScreen(repo,{preferences.edit().putBoolean("gettingStartedSeen",true).apply();tourSeen=true;back()},::navigate)
                    page=="Trips"->TripsScreen(repo,::navigate)
                    page=="Money"->MoneyScreen(repo,::navigate)
                    page=="Spending & review"->SpendingReviewScreen(repo,::navigate)
                    page.startsWith("Money record:")->MoneyDetailScreen(repo,page.substringAfter(':'),::navigate,::back)
                    page=="Account"->AccountHubScreen(repo,::navigate,{tracking("ASSIST")})
                    page=="Driving & expense reminders"->AssistanceScreen(repo,{tracking("ASSIST")})
                    page=="Driver Rewards"->ReferralScreen(repo)
                    page=="App privacy & data" || page=="Privacy"->PrivacyScreen()
                    page=="Alerts & reminders"->AlertsScreen(repo,::navigate)
                    page=="Goals"->GoalEditor(repo,::back)
                    page=="Position"->PositionScreen(repo)
                    page=="Start a drive"->StartDriveScreen {classification,purpose->driveClass=classification;drivePurpose=purpose;tracking("START");back()}
                    page=="Add expense"->RecordEditor(repo,DriverRecord.expense(Expense(merchant="",amountCents=0)),null,null,::back)
                    page=="Add income"->RecordEditor(repo,DriverRecord.income(Income(description="",amountCents=0)),null,null,::back)
                    page=="Add manual trip"->RecordEditor(repo,remember {DriverRecord.trip(Trip.local().copy(endedAt=now(),source="manual"))},null,null,::back)
                    page.startsWith("Edit:")->RecordEditor(repo,repo.journal.visible.firstOrNull {it.record.id==page.substringAfter(':')}?.record,null,null,::back)
                    page.startsWith("Trip:")->repo.journal.visible.firstOrNull {it.record.id==page.substringAfter(':')}?.let {entry->TripDetail(repo,entry.record,{navigate("Edit:${entry.record.id}")},{navigate("Trip routes:${entry.record.id}")},::back)}
                    page.startsWith("Trip routes:")->TripRouteOptionsScreen(repo,page.substringAfter(':'))
                    page.startsWith("Prompt:")->RecordEditor(repo,null,null,repo.journal.placePrompts.firstOrNull {it.id==page.substringAfter(':')},::back)
                    page=="Bank inbox"->BankScreen(repo,{navigate("Import statement")},{navigate("Bank:${it.id}")})
                    page.startsWith("Bank:")->RecordEditor(repo,null,repo.journal.bankTransactions.firstOrNull {it.id==page.substringAfter(':')},null,::back)
                    page=="Import statement"->BankImport(repo,::back)
                    page=="Offers"->OffersInboxScreen(repo,::navigate)
                    page=="Offer settings"->OfferPlatformsScreen(repo,::navigate)
                    page=="Offer reader"->OfferReaderScreen(repo)
                    page.startsWith("Offer reader:")->OfferReaderScreen(repo,page.substringAfter(':'))
                    page=="Enter offer"->ManualOfferScreen(repo,::back)
                    page=="Choose screenshot"->ScreenshotImportScreen(repo,::navigate)
                    page=="Screenshot guide"->Unit
                    page=="Sample shift"->SampleOffersScreen(repo,::navigate)
                    page=="Sample offers"->SampleOffersScreen(repo,::navigate,"Offers")
                    page.startsWith("Offer:")->OfferDetailScreen(repo,page.substringAfter(':'),::navigate)
                    page.startsWith("Offer route:")->OfferRouteScreen(repo,page.substringAfter(':'))
                    page.startsWith("Review offer:")->ManualOfferScreen(repo,::back,page.substringAfter(':'))
                    page=="Capture diagnostics" || page=="Offer Capture Diagnostics"->OfferDiagnosticsScreen(repo,navigate=::navigate)
                    page.startsWith("Capture:")->OfferDiagnosticsScreen(repo,page.substringAfter(':'),navigate=::navigate)
                    page=="Ratings & reviews"->ReputationScreen(repo,::navigate)
                    page.startsWith("Ratings & reviews:")->ReputationScreen(repo,::navigate,page.substringAfter(':'))
                    page=="Add rating"->ReputationEntryScreen(repo,"rating",::back)
                    page.startsWith("Add rating:")->ReputationEntryScreen(repo,"rating",::back,page.substringAfter(':'))
                    page=="Add review"->ReputationEntryScreen(repo,"review",::back)
                    page.startsWith("Add review:")->ReputationEntryScreen(repo,"review",::back,page.substringAfter(':'))
                    page=="Get help"->OfficeHelpScreen(repo,::navigate)
                    page=="Tax details"->CoachIntakeScreen(repo,::back)
                    page=="Universal Delivery" || page=="In-store Shopper"->UniversalWorkScreen(repo,page,::navigate)
                    page=="Log shopping job" || page=="Log delivery job"->RecordEditor(repo,remember {
                        val shopping=page=="Log shopping job";val work=repo.journal.universalWorkProfiles[if(shopping) "In-store Shopper" else "Universal Delivery"]?.workLabel ?: if(shopping) "In-store Shopper" else "Universal Delivery"
                        DriverRecord.trip(Trip.local().copy(endedAt=now(),source="manual",classification="business",platform=work,
                            purpose=work+if(shopping) " shopping job" else " delivery job",rideRole=if(shopping) "shopping" else "delivery",distanceMeters=0.0))
                    },null,null,::back)
                    page=="Connected jobs & pay" || page=="Connected work"->ConnectedWorkScreen(repo)
                    page=="Planning reserves & history" || page=="Planning reserves"->ReserveHistoryScreen(repo)
                    page=="My tax documents & progress"->TaxDocumentsScreen(repo)
                    page=="Protected data"->ProtectedDataScreen(repo)
                    page=="Protected Journal"->ProtectedJournalScreen(repo)
                }
                Spacer(Modifier.height(24.dp))
            }
        }
        repo.failure?.let {error->AlertDialog(onDismissRequest={repo.failure=null},title={Text("Please review")},text={Text(error)},
            confirmButton={TextButton(onClick={repo.failure=null}) {Text("OK")}})}
    }}
}
