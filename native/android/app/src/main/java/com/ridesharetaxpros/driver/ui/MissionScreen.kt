package com.ridesharetaxpros.driver.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@Composable fun MissionScreen(repo: DriverRepository,navigate: (String)->Unit) {
    val scope=repo.scope;val context=LocalContext.current
    val mission=repo.journal.mission
    var goal by remember(scope) {mutableStateOf("100")}
    var deadline by remember(scope) {mutableStateOf(ZonedDateTime.now().plusHours(4))}
    var destination by remember(scope) {mutableStateOf("Home")}
    var custom by remember(scope) {mutableStateOf("")}
    var label by remember(scope) {mutableStateOf("")}
    var payout by remember(scope) {mutableStateOf("")};var fees by remember(scope) {mutableStateOf("")}
    var miles by remember(scope) {mutableStateOf("")};var minutes by remember(scope) {mutableStateOf("")}
    var wait by remember(scope) {mutableStateOf("")};var homeMinutes by remember(scope) {mutableStateOf("")}
    var direction by remember(scope) {mutableStateOf("Unknown")}
    var pickup by remember(scope) {mutableStateOf("")};var observedWait by remember(scope) {mutableStateOf("")}
    val records=repo.journal.visible.map {it.record}
    val allRides=records.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}.map {RideProfit(it,repo.journal.goals)}
    fun draft(): ComparedMissionOffer? = runCatching {
        ComparedMissionOffer(label=label.trim().take(100).ifBlank {"Offer"},direction=direction,
            payoutCents=StatementImport.cents(payout),feesCents=StatementImport.cents(fees),
            miles=miles.toDouble(),minutes=minutes.toDouble(),waitMinutes=wait.toDouble(),
            homeMinutes=homeMinutes.takeIf {it.isNotBlank()}?.toDouble())
    }.getOrNull()
    val result=draft()?.activeHourEstimate(repo.journal.goals,mission?.deadline)
    Panel {
        Row(horizontalArrangement=Arrangement.spacedBy(14.dp)) {Icon(Icons.Default.Home,null,tint=Pink,modifier=Modifier.size(30.dp))
            Column {Text("Get paid on the way.",fontSize=23.sp,fontWeight=FontWeight.Bold);Text("Your destination. Your finish time.",color=Muted,fontSize=14.sp)}}
        Text("Set a mission, find a historical waiting-area match, and check each offer's real costs and road route.",color=Muted,fontSize=12.sp)
        TextButton(onClick={navigate("Offers")}) {Text("Read an incoming offer")}
    }
    if(mission!=null) {
        val clock=Instant.now();val end=minOf(clock,Instant.parse(mission.deadline));val start=Instant.parse(mission.startedAt)
        val rides=allRides.filter {Instant.parse(it.record.trip().startedAt)>=start && Instant.parse(it.record.trip().endedAt)<=end}
        val net=rides.sumOf {it.net?.toLong() ?: 0L};val missing=rides.count {it.net==null}
        Panel("Your mission") {
            Text("Earn ${usd(mission.targetCents)} and finish by ${Instant.parse(mission.deadline).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))}",fontWeight=FontWeight.Bold)
            Text("Finish near: ${mission.destination}")
            LinearProgressIndicator(progress={(net.toFloat()/mission.targetCents).coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth(),color=Pink)
            Text("${usd(net)} estimated net · ${usd(maxOf(0L,mission.targetCents-net))} remaining")
            Text(String.format(Locale.US,"%.1f unpaid miles during this mission",rides.filter {it.record.trip().rideRole=="reposition"}.sumOf {it.miles}),fontSize=13.sp)
            if(missing>0) Text("$missing completed drives need fare, fees or vehicle cost before they count.",color=Caution,fontSize=13.sp)
            if(clock>Instant.parse(mission.deadline)) Text("Deadline passed. Update or end this mission.",color=Caution)
            TextButton(onClick={repo.run {repo.update {it.copy(mission=null)}}}) {Text("End mission",color=Danger)}
        }
    }
    Panel(if(mission==null) "Create today's mission" else "Replace mission") {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly) {listOf(50,100,150,200).forEach {amount->OutlinedButton(onClick={goal=amount.toString()},contentPadding=PaddingValues(8.dp)) {Text("$$amount")}}}
        Field("Net earnings goal ($)",goal,{goal=it})
        NavigationRow("Finish by",{
            DatePickerDialog(context,{_,year,month,day->
                val selected=deadline.withDayOfMonth(1).withYear(year).withMonth(month+1).withDayOfMonth(day)
                TimePickerDialog(context,{_,hour,minute->deadline=selected.withHour(hour).withMinute(minute)},deadline.hour,deadline.minute,false).show()
            },deadline.year,deadline.monthValue-1,deadline.dayOfMonth).show()
        },deadline.format(DateTimeFormatter.ofPattern("MMM d, h:mm a")))
        Choice("End near",destination,linkedMapOf("Home" to "Home","Work" to "Work","Custom" to "Custom")) {destination=it}
        if(destination=="Custom") {Field("Custom destination label",custom,{custom=it.take(100)});Text("Use the offer calculator below to enter your own travel time toward your chosen destination.",color=Muted,fontSize=12.sp)}
        Action("Save mission",{repo.run {
            val cents=StatementImport.cents(goal);require(cents>0 && deadline.toInstant()>Instant.now()) {"Enter a positive goal and future deadline."}
            val name=if(destination=="Custom") custom.trim().also {require(it.isNotEmpty()) {"Enter a custom destination label."}} else destination
            repo.update {it.copy(mission=ShiftMission(cents,deadline.toInstant().toString(),name),missionOffers=emptyList())}
        }},enabled=repo.storageReady)
        Text("Changing a mission starts a new progress window. It does not delete your drives.",color=Muted,fontSize=12.sp)
    }
    Panel("Evaluate an offer") {
        Text("Enter the complete job, including pickup miles and your best estimate of unpaid repositioning. These are estimates, not a guarantee.",fontSize=12.sp,color=Muted)
        Field("Offer label or platform (optional)",label,{label=it});Field("Offered payout ($)",payout,{payout=it})
        Field("Fees ($; enter 0 if none)",fees,{fees=it});Field("Total job and unpaid miles",miles,{miles=it})
        Field("Job and pickup minutes",minutes,{minutes=it});Field("Pickup wait minutes",wait,{wait=it})
        Field("Minutes from drop-off to destination",homeMinutes,{homeMinutes=it})
        Choice("Direction after drop-off",direction,linkedMapOf("Unknown" to "Unknown","Toward" to "Toward destination","Away" to "Away from destination")) {direction=it}
        if(result!=null) {
            Text("Estimated net ${usd(result.netCents)} · ${usd(result.hourlyCents.roundToInt())}/active hour",fontWeight=FontWeight.Bold)
            Text("Minimum payout for your hourly goal: ${usd(result.minimumCents)}")
            Text("Hourly rate and minimum use the entered pickup, job and wait time. They exclude the drive to your destination. Include any additional unpaid miles above.",fontSize=12.sp,color=Muted)
            Text(if(result.meetsGoal) "Meets your entered hourly goal" else "Below your entered hourly goal",color=if(result.meetsGoal) Income else Caution)
            val buffer=result.deadlineMinutesRemaining
            Text(if(buffer==null) "Enter travel time to your destination to check the deadline." else if(buffer>=0) "Estimated ${buffer.toInt()} minutes of deadline buffer" else "Estimated ${(-buffer).toInt()} minutes past your deadline",fontSize=13.sp,color=if(buffer!=null && buffer<0) Danger else Muted)
            Text(if(direction=="Unknown") "Direction not assessed." else "Direction is your assessment: ${if(direction=="Toward") "toward" else "away from"} your destination.",fontSize=12.sp,color=Muted)
            Action("Add to offer comparison",{repo.run {val value=draft() ?: error("Check the entered offer details.");require(value.activeHourEstimate(repo.journal.goals,repo.journal.mission?.deadline)!=null);repo.update {it.copy(missionOffers=(it.missionOffers+value).takeLast(20))}}},primary=false)
        } else Text("Enter payout, known fees, miles, minutes and wait. Set your own hourly target and vehicle cost in Earnings → Goals.",fontSize=12.sp,color=Muted)
    }
    Panel("Get paid going home") {
        Text("While parked, select your actual destination and compare your historical job-start areas using current road routes.",fontSize=13.sp,color=Muted)
        Action("Choose destination & waiting areas",{navigate("Position")},primary=false)
        Text("Your route and location may change. Compare again after conditions change.",fontSize=12.sp,color=Muted)
    }
    if(repo.journal.missionOffers.isNotEmpty()) Panel("Compare your entered offers") {
        repo.journal.missionOffers.forEach {offer->offer.activeHourEstimate(repo.journal.goals,mission?.deadline)?.let {value->
            Text("${offer.label} · ${usd(value.netCents)} net · ${usd(value.hourlyCents.roundToInt())}/active hour",fontWeight=FontWeight.SemiBold)
            Text("${offer.direction} · ${if(value.meetsGoal) "meets goal" else "below goal"} · ${value.deadlineMinutesRemaining?.let {if(it>=0) "estimated within deadline" else "estimated after deadline"} ?: "deadline unknown"}",fontSize=12.sp,color=Muted)
            TextButton(onClick={repo.run {repo.update {it.copy(missionOffers=it.missionOffers.filterNot {row->row.id==offer.id})}}}) {Text("Remove offer",color=Danger)}
        }}
        Text("Compare direction, your minimum and the deadline buffer. Availability and actual driving conditions can change; no offers are fetched automatically.",fontSize=12.sp,color=Muted)
    }
    Panel("Pickup wait history") {
        Field("Restaurant or pickup location",pickup,{pickup=it.take(120)});Field("Observed wait (minutes)",observedWait,{observedWait=it})
        Action("Save observed wait",{repo.run {
            val name=pickup.trim();val value=observedWait.toDouble();require(name.isNotEmpty() && value.isFinite() && value in 0.0..240.0) {"Enter a pickup name and wait from 0 to 240 minutes."}
            repo.update {it.copy(waitSamples=(it.waitSamples+WaitSample(name,value)).takeLast(500))};observedWait=""
        }},primary=false)
        if(pickup.isNotBlank()) averageWait(repo.journal.waitSamples,pickup)?.let {(average,count)->
            Text(String.format(Locale.US,"Your average: %.1f min across %d recorded waits",average,count),fontSize=13.sp)
            TextButton(onClick={wait=String.format(Locale.US,"%.1f",average)}) {Text("Use this average in offer")}
        }
        Text("Your observations stay on this phone. Small samples may not predict your next pickup.",fontSize=12.sp,color=Muted)
    }
    Panel("Dead Mile Killer") {
        val unpaid=allRides.filter {it.record.trip().rideRole=="reposition"}.sumOf {it.miles}
        Text(String.format(Locale.US,"%.1f recorded unpaid business miles",unpaid))
        repo.journal.goals.vehicleCostCentsPerMile?.let {Text("Estimated vehicle cost: ${usd((unpaid*it).roundToInt())}")}
        Text("Classify pickup-area and return trips as driving without a paid ride. Consider offers that end nearer your next destination; review safety and actual routes first.",fontSize=12.sp,color=Muted)
    }
    Panel("Platform comparisons") {
        val groups=allRides.filter {it.hourly!=null && !it.record.trip().platform.isNullOrBlank()}.groupBy {it.record.trip().platform!!}
        if(groups.isEmpty()) Text("Add your platform and complete fares, fees and vehicle cost on business drives to compare.")
        groups.toSortedMap().forEach {(name,rows)->val total=rows.sumOf {it.minutes};if(total>0) Text("$name: ${usd((rows.sumOf {it.net ?: 0}*60/total).roundToInt())}/hour · ${rows.size} drives")}
        Text("Only your recorded completed drives are compared. Idle time, demand and platform availability may differ.",fontSize=12.sp,color=Muted)
    }
    ReserveHistoryScreen(repo)
}
