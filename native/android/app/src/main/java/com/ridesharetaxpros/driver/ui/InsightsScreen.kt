package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.time.*
import java.time.temporal.TemporalAdjusters
import kotlin.math.*

@Composable fun InsightsScreen(repo: DriverRepository,onGoals: ()->Unit,onTrip: (DriverRecord)->Unit) {
    var period by remember {mutableStateOf("30")}; val last=LocalDate.now(); val first=last.minusDays(period.toLong()-1).toString()
    val records=repo.journal.visible.map {it.record}; val totals=insights(records,repo.journal.goals,first,last.toString())
    val rides=records.filter {it.kind=="trip" && it.date in first..last.toString() && it.trip().classification=="business" && it.trip().endedAt!=null}.map {RideProfit(it,repo.journal.goals)}
    Choice("Period",period,linkedMapOf("7" to "7 days","30" to "30 days","90" to "90 days")) {period=it}
    Button(onClick=onGoals) {Text("Set goals & vehicle cost")}
    Panel("Cashflow") {
        Text("Income ${usd(totals.sumOf {it.income})} · business costs ${usd(totals.sumOf {it.expenses})}")
        Text("Cashflow ${usd(totals.sumOf {it.income-it.expenses})}",style=MaterialTheme.typography.headlineSmall)
        Bars(totals.map {it.income.toDouble()} ,totals.map {it.expenses.toDouble()})
        Text("Purple: income · pink: business spending. Calendar days with records, oldest to newest. Recorded business share is applied; missing share uses 100%.",color=Muted,style=MaterialTheme.typography.bodySmall)
        totals.takeLast(7).forEach {Text("${it.date}: ${usd(it.income)} in · ${usd(it.expenses)} out",style=MaterialTheme.typography.bodySmall)}
    }
    Panel("Fuel & charging") {Text(usd(totals.sumOf {it.fuel}),style=MaterialTheme.typography.headlineSmall);Bars(totals.map {it.fuel.toDouble()});Text("Recorded business fuel and charging costs",color=Muted)}
    Panel("Ride profitability") {
        Text(usd(rides.sumOf {it.net?.toLong() ?: 0L}),style=MaterialTheme.typography.headlineSmall)
        Text("Estimated net for ${rides.count {it.net!=null}} priced drives. ${rides.count {it.net==null}} still need fare, fees or vehicle cost.")
        Bars(totals.map {it.net.toDouble()})
        Text("Fare + tips − platform fees − your vehicle cost per mile. Kept separate from payouts and logged expenses to avoid counting them twice. This is an estimate, not a tax deduction.",color=Muted)
        Text("Unpaid driving: %.1f mi".format(rides.filter {it.record.trip().rideRole=="reposition"}.sumOf {it.miles}))
        Text("${rides.count {it.record.trip().hasGaps}} drives have GPS gaps · ${records.count {it.kind=="trip" && it.trip().classification=="unclassified"}} need classification",color=Muted)
    }
    val todayNet=totals.firstOrNull {it.date==today()}?.net ?: 0L
    val monday=last.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()
    val weekNet=insights(records,repo.journal.goals,monday,today()).sumOf {it.net}
    Panel("Goal progress") {
        GoalBar("Today",todayNet,repo.journal.goals.dailyNetCents); GoalBar("This calendar week",weekNet,repo.journal.goals.weeklyNetCents)
        Text("Only completed business drives with all cost inputs count toward net goals.",color=Muted)
    }
    for(grouping in listOf("Platform","Work area","Start hour")) Panel("$grouping comparison") {
        val groups=rides.filter {it.net!=null && it.minutes>=1}.groupBy {profit->val t=profit.record.trip();when(grouping) {
            "Platform"->t.platform?.takeIf {it.isNotBlank()} ?: "Unspecified"
            "Work area"->t.workArea?.takeIf {it.isNotBlank()} ?: "Unspecified"
            else->Instant.parse(t.startedAt).atZone(ZoneId.of(t.timeZoneId ?: "UTC")).hour.toString().padStart(2,'0')+":00"
        }}.map { (name,values)->Triple(name,values.sumOf {it.net!!.toDouble()}/(values.sumOf {it.minutes}/60),values.size) }.sortedByDescending {it.second}
        if(groups.isEmpty()) Text("Add fares, fees and vehicle cost to compare your recorded drives.")
        groups.take(12).forEach {Text("${it.first} · ${usd(it.second)}/hour · ${it.third} drives")}
        Text("Observed sample only. Demand, traffic and missing waiting time can change the result.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    Panel("Drives to review") {rides.filter {it.net!=null && (it.net!!<0 || (repo.journal.goals.targetHourlyCents?.let {goal->(it.hourly ?: goal.toDouble())<goal}==true))}.take(8).forEach {r->TextButton(onClick={onTrip(r.record)}) {Text("${r.record.title} · ${usd(r.net!!)} estimated net")}}}
}
@Composable private fun GoalBar(label: String,net: Long,target: Int?) {
    Text(if(target==null) "$label: goal not set" else "$label: ${usd(net)} / ${usd(target)}")
    if(target!=null && target>0) LinearProgressIndicator(progress={(net.toFloat()/target).coerceIn(0f,1f)},Modifier.fillMaxWidth(),color=Pink)
}
@Composable fun Bars(values: List<Double>,second: List<Double> = emptyList()) {
    Canvas(Modifier.fillMaxWidth().height(140.dp)) {
        val maximum=(values+second).maxOfOrNull {abs(it)}?.coerceAtLeast(1.0) ?: 1.0
        val negative=values.any {it<0}; val baseline=if(negative) size.height/2 else size.height
        drawLine(Muted,Offset(0f,baseline),Offset(size.width,baseline),1f)
        val unit=size.width/(values.size.coerceAtLeast(1)); val scale=if(negative) size.height/2 else size.height
        values.forEachIndexed {i,value->val height=(abs(value)/maximum*scale).toFloat();val width=unit*(if(second.isEmpty()) .7f else .35f)
            drawRect(if(value<0) Color(0xFFFF886B) else Purple,Offset(i*unit,if(value>=0) baseline-height else baseline),Size(width,height))
            second.getOrNull(i)?.let {cost->val h=(abs(cost)/maximum*scale).toFloat();drawRect(Pink,Offset(i*unit+width,baseline-h),Size(width,h))}
        }
    }
}
@Composable fun GoalEditor(repo: DriverRepository,done: ()->Unit) {
    fun value(cents: Number?)=cents?.let {"%.2f".format(java.util.Locale.US,it.toDouble()/100)} ?: ""
    var daily by remember {mutableStateOf(value(repo.journal.goals.dailyNetCents))}; var weekly by remember {mutableStateOf(value(repo.journal.goals.weeklyNetCents))}
    var hourly by remember {mutableStateOf(value(repo.journal.goals.targetHourlyCents))}; var cost by remember {mutableStateOf(value(repo.journal.goals.vehicleCostCentsPerMile))}
    Panel("Your targets") {Field("Daily net goal ($)",daily,{daily=it});Field("Weekly net goal ($)",weekly,{weekly=it});Field("Target net per hour ($)",hourly,{hourly=it});Field("Estimated vehicle cost per mile ($)",cost,{cost=it});Text("Use your own estimated operating cost, including fuel and wear. This is not the IRS mileage rate. Leave unknown values empty.",color=Muted)}
    Button(onClick={repo.run {fun cents(text: String)=text.takeIf {it.isNotBlank()}?.let {StatementImport.cents(it).also {require(it>0)}}
        val vehicle=cost.takeIf {it.isNotBlank()}?.toDouble()?.times(100)?.also {require(it.isFinite() && it in 0.0..10000.0)}
        repo.update {it.copy(goals=Goals(cents(daily),cents(weekly),cents(hourly),vehicle))};done()}}) {Text("Save goals")}
}
@Composable fun TripDetail(repo: DriverRepository,original: DriverRecord,onEdit: ()->Unit) {
    val record=repo.journal.visible.firstOrNull {it.record.id==original.id}?.record ?: original; val trip=record.trip();val profit=RideProfit(record,repo.journal.goals)
    var route by remember {mutableStateOf<List<LocationFix>>(emptyList())}; var alternate by remember {mutableStateOf("")};var minutes by remember {mutableStateOf("")}
    LaunchedEffect(record.id) {repo.run {route=repo.store.route(repo.scope,record.id)}}
    Panel(record.title) {Text("${record.date} · %.2f mi · %.0f minutes".format(profit.miles,profit.minutes));Text("${classifications[trip.classification]} · ${trip.platform ?: "Platform unspecified"}")
        Text(profit.net?.let {"${usd(it)} estimated net"} ?: "Add fare, fees and vehicle cost to estimate profit.",style=MaterialTheme.typography.headlineSmall)
        Text("Fare ${profit.fare?.let(::usd) ?: "unknown"} · fees ${profit.fees?.let(::usd) ?: "unknown"} · vehicle ${profit.vehicle?.let(::usd) ?: "unknown"}")
        profit.hourly?.let {Text("${usd(it)}/hour · ${profit.perMile?.let(::usd) ?: "—"}/mile")}
        if(trip.hasGaps) Text("GPS gaps: review distance before relying on this estimate.",color=Color(0xFFFFBD73))
        Button(onClick=onEdit,enabled=repo.journal.activeTripId!=record.id) {Text("Edit trip")}
    }
    if(route.size>=2) Panel("Your recorded route") {
        Canvas(Modifier.fillMaxWidth().height(220.dp)) {
            val latMin=route.minOf {it.latitude};val latSpan=(route.maxOf {it.latitude}-latMin).coerceAtLeast(.00001)
            val lonMin=route.minOf {it.longitude};val lonSpan=(route.maxOf {it.longitude}-lonMin).coerceAtLeast(.00001)
            val path=Path();route.forEachIndexed {i,fix->val x=((fix.longitude-lonMin)/lonSpan*(size.width-20)+10).toFloat();val y=(size.height-10-(fix.latitude-latMin)/latSpan*(size.height-20)).toFloat();if(i==0 || fix.startsSegment==true) path.moveTo(x,y) else path.lineTo(x,y)}
            drawPath(path,Pink,style=Stroke(4f))
        }
        Text("Phone-only route sketch. Gaps start a new segment; this is not a street map.",color=Muted)
        OutlinedButton(onClick={repo.run {val a=route.first();val b=route.last();val uri=Uri.parse("https://www.google.com/maps/dir/?api=1&origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}&travelmode=driving")
            repo.app.startActivity(Intent(Intent.ACTION_VIEW,uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}}) {Text("Compare current routes in Maps")}
        Text("Opening Maps shares these endpoints with your chosen maps provider. Current directions do not prove a past ride had a shorter viable route.",color=Muted)
    }
    Panel("Compare a route option") {Field("Alternative distance (miles)",alternate,{alternate=it});Field("Alternative duration (minutes)",minutes,{minutes=it})
        val distance=alternate.toDoubleOrNull()?.takeIf {it.isFinite() && it>=0};val duration=minutes.toDoubleOrNull()?.takeIf {it.isFinite() && it>=1};val rate=repo.journal.goals.vehicleCostCentsPerMile
        if(distance!=null && rate!=null) {Text("Estimated vehicle-cost difference: ${usd((profit.miles-distance)*rate)} saved")
            if(duration!=null && profit.fare!=null && profit.fees!=null) Text("Same fare and fees: ${usd((profit.fare!!-profit.fees!!-distance*rate)/(duration/60))}/hour")}
        Text("Enter a current route estimate from Maps. Check traffic, pickup requirements and unpaid travel before choosing.",color=Muted)
    }
}
