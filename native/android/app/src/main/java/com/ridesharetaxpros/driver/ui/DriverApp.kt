package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.tracking.DriveService

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DriverApp(repo: DriverRepository) {
    var tab by rememberSaveable { mutableStateOf("Today") }; var page by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<DriverRecord?>(null) }; var bank by remember { mutableStateOf<BankTransaction?>(null) }
    var prompt by remember { mutableStateOf<ExpensePrompt?>(null) }; var serviceAction by remember { mutableStateOf("START") }
    val permissions=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if(granted[Manifest.permission.ACCESS_FINE_LOCATION]==true) try { ContextCompat.startForegroundService(repo.app,Intent(repo.app,DriveService::class.java).setAction(serviceAction)) } catch(error: Exception) { repo.failure=error.message }
        else repo.failure="Precise location is needed to measure miles. Manual trips are available."
    }
    fun tracking(action: String) { serviceAction=action; permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION)+if(Build.VERSION.SDK_INT>=33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray()) }
    fun edit(record: DriverRecord) { editing=record; bank=null; prompt=null; page="Edit" }
    BrandTheme { Scaffold(containerColor=Ink,topBar={ TopAppBar(title={ Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        Image(painterResource(R.drawable.brand_mark),null,Modifier.size(32.dp)); Text(page ?: "Rideshare Tax Pros",style=MaterialTheme.typography.titleLarge)
    } },navigationIcon={ if(page!=null) IconButton(onClick={page=null;editing=null;bank=null;prompt=null}) { Icon(Icons.Default.ArrowBack,"Back") } }) },bottomBar={ if(page==null) NavigationBar(containerColor=Panel) {
        listOf("Today" to Icons.Default.Home,"Trips" to Icons.Default.DirectionsCar,"Money" to Icons.Default.ReceiptLong,"Insights" to Icons.Default.BarChart,"Account" to Icons.Default.Person).forEach { (name,icon)->
            NavigationBarItem(selected=tab==name,onClick={tab=name},icon={Icon(icon,name)},label={Text(name)}) }
    } }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
            if(!repo.storageReady) Panel("Recording unavailable") { Text(repo.failure ?: "Storage is unavailable.") }
            else when(page) {
                "Edit" -> RecordEditor(repo,editing,bank,prompt) { page=null; editing=null; bank=null; prompt=null }
                "Trip" -> editing?.let { TripDetail(repo,it,onEdit={page="Edit"}) }
                "Goals" -> GoalEditor(repo) { page=null }
                "Shift Mission" -> MissionScreen(repo)
                "Import statement" -> BankImport(repo) { page="Bank inbox" }
                "Bank inbox" -> BankScreen(repo,onImport={page="Import statement"},onReview={bank=it;editing=null;prompt=null;page="Edit"})
                "Driver Rewards" -> ReferralScreen(repo)
                "Privacy" -> PrivacyScreen()
                else -> when(tab) {
                    "Today" -> {
                        Panel("Shift Mission") {
                            Text("Earn toward your goal and plan your way home.",color=Muted)
                            Button(onClick={page="Shift Mission"},Modifier.fillMaxWidth()) {Text(if(repo.journal.mission==null) "Create today's mission" else "Open my mission")}
                        }
                        Panel("Drive with a clearer picture") {
                            Text("Your miles. Your money. Your next goal.",color=Muted)
                            val active=repo.journal.active?.record
                            Text("%.2f mi".format((active?.trip()?.distanceMeters ?: 0.0)/1609.344),style=MaterialTheme.typography.displaySmall)
                            Text(repo.trackingStatus,color=Muted)
                            if(active==null) Button(onClick={tracking("START")},Modifier.fillMaxWidth()) { Text("Start drive") }
                            else { Button(onClick={repo.run { repo.endDrive(); if(!repo.journal.assistance.automaticDrives && !repo.journal.assistance.placeReminders) repo.app.stopService(Intent(repo.app,DriveService::class.java)) else tracking("STOP") }},Modifier.fillMaxWidth()) { Text("End drive") }
                                OutlinedButton(onClick={tracking("RESUME")}) { Text("Resume location tracking") } }
                            Text("Detected drives need your review. A moving phone cannot identify a paid Uber or Lyft ride.",style=MaterialTheme.typography.bodySmall,color=Muted)
                        }
                        val total=insights(repo.journal.visible.map { it.record },repo.journal.goals,today(),today()).firstOrNull()
                        Panel("Today at a glance") { Text("Income ${usd(total?.income ?: 0)} · business spending ${usd(total?.expenses ?: 0)}")
                            Text("${repo.journal.visible.count { it.record.kind=="trip" && it.record.trip().classification=="unclassified" }} drives need review") }
                        repo.journal.placePrompts.filterNot { it.dismissed }.reversed().take(6).forEach { item->Panel("Near ${item.merchant}") {
                            Text("Did you make a purchase? ${expenseCategories[item.category]}")
                            Button(onClick={prompt=item;editing=null;bank=null;page="Edit"}) { Text("Log expense") }
                            TextButton(onClick={repo.run { repo.update { it.copy(placePrompts=it.placePrompts.map { p->if(p.id==item.id) p.copy(dismissed=true) else p }) } }}) { Text("Not a purchase") }
                        } }
                        Button(onClick={page="Driver Rewards"},Modifier.fillMaxWidth()) { Text("Invite a friend · earn $20 + points") }
                    }
                    "Trips" -> {
                        Button(onClick={edit(DriverRecord.trip(Trip.local().copy(endedAt=now(),source="manual")))}) { Text("Add manual trip") }
                        repo.journal.visible.filter { it.record.kind=="trip" }.forEach { entry-> val record=entry.record; Panel(record.title) {
                            Text("${record.date} · %.2f mi · ${classifications[record.trip().classification]}".format(record.trip().distanceMeters/1609.344))
                            TextButton(onClick={editing=record;page="Trip"}) { Text("Review trip") }
                        } }
                    }
                    "Money" -> {
                        Row(horizontalArrangement=Arrangement.spacedBy(12.dp)) { Button(onClick={edit(DriverRecord.expense(Expense(merchant="",amountCents=0)))}) { Text("Add expense") }; Button(onClick={edit(DriverRecord.income(Income(description="",amountCents=0)))}) { Text("Add income") } }
                        OutlinedButton(onClick={page="Bank inbox"},Modifier.fillMaxWidth()) { Text("Banks & statement imports") }
                        repo.journal.visible.filter { it.record.kind!="trip" }.forEach { entry->Panel(entry.record.title) {
                            val r=entry.record; Text("${r.date} · ${usd(if(r.kind=="expense") r.expense().amountCents else r.income().amountCents)}")
                            if(r.kind=="expense") Text("${expenseCategories[r.expense().category]} · ${classifications[r.expense().classification]}",color=Muted)
                            TextButton(onClick={edit(r)}) { Text("Review details") }
                        } }
                    }
                    "Insights" -> InsightsScreen(repo,onGoals={page="Goals"},onTrip={editing=it;page="Trip"})
                    "Account" -> AccountScreen(repo,onRewards={page="Driver Rewards"},onPrivacy={page="Privacy"},onTracking={tracking("ASSIST")})
                }
            }
            Spacer(Modifier.height(24.dp))
        }
        repo.failure?.let { error -> AlertDialog(onDismissRequest={repo.failure=null},title={Text("Please review")},text={Text(error)},confirmButton={TextButton(onClick={repo.failure=null}) { Text("OK") }}) }
    } }
}
