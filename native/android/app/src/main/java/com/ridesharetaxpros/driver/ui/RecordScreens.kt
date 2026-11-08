package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.core.content.ContextCompat
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.tracking.DriveService
import com.ridesharetaxpros.driver.tracking.TripAlertNotifications
import java.time.Instant
import java.util.Locale

@Composable fun StartDriveScreen(start:(String,String)->Unit) {
    var classification by remember {mutableStateOf("unclassified")};var purpose by remember {mutableStateOf("")}
    Panel("This drive") {Choice("Classification",classification,classifications) {classification=it};Field("Purpose (optional)",purpose,{purpose=it.take(240)})}
    Text("Android shows its location indicator and a persistent notification while recording. End the drive to save it. Optional automatic assistance is controlled separately in Account. Review missing sections if the app stops or the signal is lost.",color=Muted)
    Action("Start",{start(classification,purpose)})
}
@Composable fun TripsScreen(repo:DriverRepository,navigate:(String)->Unit) {
    Action("Add manual trip",{navigate("Add manual trip")},false)
    val rows=repo.journal.visible.filter {it.record.kind=="trip"}
    if(rows.isEmpty()) Panel {
        Icon(Icons.Default.DirectionsCar,null,tint=Route)
        Text("Your trips start here",fontSize=22.sp,fontWeight=FontWeight.Bold)
        Text("Start a drive from Home, or add a trip from your own mileage records.",color=Muted)
    }
    rows.forEach {entry->val record=entry.record;val trip=record.trip()
        Panel(record.title) {
            Text("${record.date} · %.2f mi".format(Locale.US,trip.distanceMeters/1609.344),color=Muted)
            Text(classifications[trip.classification] ?: trip.classification,color=if(trip.classification=="business") Income else Muted)
            if(trip.hasGaps) Text("Mileage needs review",color=Caution)
            Text(if(entry.conflict!=null) "Review sync conflict" else if(entry.pendingMutationId!=null) "Saved on phone · Sync pending" else "Synced to your firm",fontSize=12.sp,color=Link)
            NavigationRow("Review trip",{navigate("Trip:${record.id}")})
        }
    }
}
@Composable fun MoneyScreen(repo:DriverRepository,navigate:(String)->Unit) {
    var kind by remember {mutableStateOf("expense")}
    NavigationRow("Banks & statement imports",{navigate("Bank inbox")})
    NavigationRow("Spending & review",{navigate("Spending & review")})
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        listOf("expense" to "Expenses","income" to "Income").forEachIndexed {index,(key,label)->
            SegmentedButton(kind==key,{kind=key},SegmentedButtonDefaults.itemShape(index,2)) {Text(label)}
        }
    }
    Action(if(kind=="income") "Add income" else "Add expense",{navigate(if(kind=="income") "Add income" else "Add expense")},false)
    val records=repo.journal.visible.filter {it.record.kind==kind}
    if(records.isEmpty()) Panel(if(kind=="income") "No income entries yet" else "No expenses yet") {
        Text(if(kind=="income") "Add an observed amount from your records." else "Add a purchase and choose a receipt to keep its details together.",color=Muted)
    }
    records.forEach {entry->val r=entry.record
        Panel(r.title) {Text("${r.date} · ${usd(if(kind=="expense") r.expense().amountCents else r.income().amountCents)}",fontWeight=FontWeight.SemiBold)
            if(kind=="expense") Text("${expenseCategories[r.expense().category]} · ${classifications[r.expense().classification]}",color=Muted)
            Text(if(entry.pendingMutationId!=null) "Saved on phone · Sync pending" else "Synced to your firm",fontSize=12.sp,color=Link)
            if(kind=="expense" && r.expense().reviewNotes().isNotEmpty()) Text("Details to review",color=Caution)
            if(kind=="expense" && r.expense().receiptId!=null) Text("Receipt attached",color=Link)
            NavigationRow("Review details",{navigate("Money record:${r.id}")})
        }
    }
}
@Composable fun SpendingReviewScreen(repo:DriverRepository,navigate:(String)->Unit) {
    var period by remember {mutableStateOf("month")}
    val records=expenseReviewRecords(repo.journal.visible.map {it.record},period)
    val expenses=records.map {it.expense()}
    Panel {
        Choice("Period",period,linkedMapOf("month" to "This month","year" to "This year","all" to "All dates")) {period=it}
        Row {Text("Recorded spending",Modifier.weight(1f),fontWeight=FontWeight.Bold);Text(usd(expenses.sumOf {it.amountCents}),color=ExpenseColor,fontWeight=FontWeight.Bold)}
        Text("Includes personal and unreviewed costs. This total is spending, not a calculated tax deduction.",color=Muted)
    }
    Panel("Where the money goes") {
        if(expenses.isEmpty()) Text("Add an expense to see your category totals.",color=Muted)
        expenses.groupBy {it.category}.entries.sortedWith(compareByDescending<Map.Entry<String,List<Expense>>> {it.value.sumOf {e->e.amountCents}}.thenBy {expenseCategories[it.key] ?: it.key}).forEach {(category,rows)->
            Row {Text(expenseCategories[category] ?: category,Modifier.weight(1f));Text(usd(rows.sumOf {it.amountCents}),color=ExpenseColor)}
        }
    }
    val needsReview=records.filter {it.expense().reviewNotes().isNotEmpty()}
    Panel("Details to review · ${needsReview.size}") {
        if(needsReview.isEmpty())Text("No missing-detail prompts for these records.",color=Muted)
        needsReview.forEach {record->
            NavigationRow(record.title,{navigate("Money record:${record.id}")},"${record.date} · ${usd(record.expense().amountCents)}")
            Text(record.expense().reviewNotes().joinToString(" · "),color=Muted)
        }
    }
    Panel("Make your records useful") {
        Text("Keep receipts and record the business purpose while it is fresh. For repairs, note the vehicle and odometer. For meals, record the participants or business-travel context.",color=Muted)
        Text("Track rider snacks as amenities and your own food as meals. Use the payment field to identify costs already deducted from a platform payout. Review similar-payment warnings before saving a duplicate.",color=Muted)
        Text("Your tax preparer reviews meal eligibility, shared-use costs and the appropriate vehicle-expense method. This app keeps the evidence and does not combine mileage and vehicle costs into a deduction.",color=Muted)
        NavigationRow("IRS travel, meal & vehicle recordkeeping",{repo.run {openPublicLink(repo,"https://www.irs.gov/publications/p463")}})
    }
}
@Composable fun AlertsScreen(repo:DriverRepository,navigate:(String)->Unit) {
    var pendingStart by rememberSaveable {mutableStateOf<String?>(null)}
    var pendingScope by rememberSaveable {mutableStateOf<String?>(null)}
    var sendScope by rememberSaveable {mutableStateOf<String?>(null)}
    fun intent(alert:TripAlertToken,action:String)=Intent(repo.app,DriveService::class.java).setAction("TRIP_ALERT")
        .putExtra("scope",alert.scope).putExtra("alertId",alert.id).putExtra("alertAction",action)
    val locationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {granted->
        val id=pendingStart;val scope=pendingScope;pendingStart=null;pendingScope=null
        if(scope==repo.scope && id!=null && granted[Manifest.permission.ACCESS_FINE_LOCATION]==true) {
            repo.journal.tripAlerts.firstOrNull {it.id==id && it.scope==scope}?.let {alert->runCatching {ContextCompat.startForegroundService(repo.app,intent(alert,"start"))}.onFailure {repo.failure=it.message}}
        } else repo.failure="Precise location is needed before starting a trip. Manual entries remain available."
    }
    fun sendAlert() {if(repo.journal.activeTripId==null)TripAlertNotifications.start(repo) else TripAlertNotifications.end(repo)}
    val notificationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        if(sendScope==repo.scope)sendAlert();sendScope=null
    }
    fun answer(alert:TripAlertToken,action:String,reply:String) {
        require(alert.scope==repo.scope) {"This alert belongs to another account."}
        when(action) {
            "start"->{pendingStart=alert.id;pendingScope=alert.scope;locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))}
            "end"->ContextCompat.startForegroundService(repo.app,intent(alert,"end"))
            else->TripAlertNotifications.perform(repo,intent(alert,action),reply)
        }
    }
    val rows=repo.journal.tripAlerts.filter {it.scope==repo.scope && it.handledAt==null && Instant.now()<Instant.parse(it.expiresAt)}.reversed()
    if(rows.isEmpty()) Panel("You’re up to date") {Icon(Icons.Default.MarkChatRead,null,tint=Income);Text("Trip and purchase prompts will appear here and in notifications.",color=Muted)}
    rows.forEach {alert->key(alert.id) {AlertActionRow(alert,::answer)}}
    Panel("Your reminders") {
        Text("Send a trip prompt or choose when driving and expense reminders appear. Respond while safely parked.",color=Muted)
        Action("Send a trip alert",{repo.run {
            if(Build.VERSION.SDK_INT>=33) {sendScope=repo.scope;notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)} else sendAlert()
        }})
        NavigationRow("Driving & expense reminders",{navigate("Driving & expense reminders")})
    }
}

@Composable private fun AlertActionRow(alert:TripAlertToken,answer:(TripAlertToken,String,String)->Unit) {
    var reply by rememberSaveable {mutableStateOf("")};var error by remember {mutableStateOf<String?>(null)}
    fun act(action:String) {try {answer(alert,action,reply);error=null}catch(failure:Exception) {error=failure.message}}
    Panel {
        Text("GIG TAX PROS · ACTION NEEDED",color=if(alert.kind=="fare") Income else if(alert.kind=="expense") ExpenseColor else Route,fontSize=11.sp,fontWeight=FontWeight.Bold)
        when(alert.kind) {
            "start"->{Text("Start a new trip?",fontWeight=FontWeight.Bold);Action("Yes, start trip",{act("start")},false)}
            "end"->{Text("Have you finished this trip?",fontWeight=FontWeight.Bold);Action("Yes, end trip",{act("end")},false);Action("Keep recording",{act("keep")},false)}
            "classify"->{Text("Business or personal?",fontWeight=FontWeight.Bold);Action("Business",{act("business")},false);Action("Personal",{act("personal")},false)}
            "fare"->{Text("Add this drive’s earnings",fontWeight=FontWeight.Bold);Text("Fare and platform fees · USD",color=Muted);Field("fare=20 fees=3",reply,{reply=it});Action("Save earnings",{act("fare")},false)}
            "expense"->{Text("Purchase to record?",fontWeight=FontWeight.Bold);Text("Purchase amount · USD",color=Muted);Field("12.34",reply,{reply=it});Action("Save amount for review",{act("expense")},false)}
        }
        TextButton(onClick={act("dismiss")}) {Text("Dismiss",color=Link)}
        error?.let {Text(it,color=Danger)}
    }
}
