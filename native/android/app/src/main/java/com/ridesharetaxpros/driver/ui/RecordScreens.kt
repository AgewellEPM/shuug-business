package com.ridesharetaxpros.driver.ui

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
            NavigationRow("Review details",{navigate("Edit:${r.id}")})
        }
    }
}
@Composable fun SpendingReviewScreen(repo:DriverRepository) {
    var days by remember {mutableStateOf("30")}
    Choice("Period",days,linkedMapOf("7" to "7 days","30" to "30 days","90" to "90 days","365" to "This year")) {days=it}
    val first=java.time.LocalDate.now().minusDays(days.toLong()-1).toString()
    val expenses=repo.journal.visible.map {it.record}.filter {it.kind=="expense" && it.date>=first}.map {it.expense()}
    Panel("Spending from your records") {Text(usd(expenses.sumOf {it.amountCents}),fontSize=34.sp,color=ExpenseColor,fontWeight=FontWeight.Bold);Text("${expenses.size} saved expenses",color=Muted)}
    Panel("By category") {
        if(expenses.isEmpty()) Text("Add expenses to see where your money went.",color=Muted)
        expenses.groupBy {it.category}.entries.sortedByDescending {it.value.sumOf {e->e.amountCents}}.forEach {(category,rows)->
            Row {Text(expenseCategories[category] ?: category,Modifier.weight(1f));Text(usd(rows.sumOf {it.amountCents}),color=ExpenseColor)}
        }
    }
    Panel("Needs review") {
        Text("${expenses.count {it.classification=="unclassified"}} expenses need classification")
        Text("${expenses.count {it.receiptId==null}} expenses have no attached receipt")
        Text("These are your recorded expenses and business-use choices. They are not a tax deduction calculation.",color=Muted)
    }
}
@Composable fun AlertsScreen(repo:DriverRepository,navigate:(String)->Unit) {
    Panel("Your driving reminders") {
        Text("Respond while safely parked. Alerts can help you review driving and purchases; Android may delay them.",color=Muted)
        NavigationRow("Driving & expense reminders",{navigate("Driving & expense reminders")})
    }
    val rows=repo.journal.tripAlerts.filter {it.scope==repo.scope && it.handledAt==null && Instant.now()<Instant.parse(it.expiresAt)}.reversed()
    if(rows.isEmpty()) Panel("No reminders need attention") {Text("New trip and purchase reminders appear here when assistance is enabled.",color=Muted)}
    rows.forEach {alert->Panel(when(alert.kind){"start"->"Start this drive?";"end"->"End this drive?";"classify"->"Classify your completed drive";"fare"->"Add fare and fees";else->"Review a purchase"}) {
        Text(alert.createdAt,color=Muted)
        if(alert.tripId!=null) NavigationRow("Review trip",{navigate("Trip:${alert.tripId}")})
        if(alert.promptId!=null) NavigationRow("Review purchase",{navigate("Prompt:${alert.promptId}")})
        TextButton(onClick={repo.run {repo.update {it.applyTripAlert(alert.id,"dismiss",repo.scope).journal}}}) {Text("Dismiss")}
    }}
}
