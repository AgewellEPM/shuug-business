package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.time.*
import java.time.temporal.TemporalAdjusters
import kotlin.math.*

@Composable fun InsightsScreen(repo: DriverRepository,onGoals: ()->Unit,onTrip: (DriverRecord)->Unit) {
    var period by remember { mutableStateOf(7) }
    val last=LocalDate.now(); val first=last.minusDays(period.toLong()-1).toString(); val through=last.toString()
    val records=repo.journal.visible.map { it.record }.filterNot { it.deleted }; val goals=repo.journal.goals
    val totals=insights(records,goals,first,through).associateBy { it.date }
    val days=(0 until period).map { last.minusDays((period-1-it).toLong()).toString() }.map { totals[it] ?: DayTotals(it) }
    val rides=records.filter { it.kind=="trip" && it.date in first..through && it.trip().classification=="business" && it.trip().endedAt!=null }.map { RideProfit(it,goals) }
    val priced=rides.filter { it.net!=null }; val drivingNet=priced.sumOf { it.net!!.toLong() }
    val pricedMinutes=priced.sumOf { it.minutes }; val pricedMiles=priced.sumOf { it.miles }
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("Know what your driving earns.",Modifier.weight(1f),fontSize=23.sp,fontWeight=FontWeight.Bold)
        TextButton(onClick=onGoals) { Text("Goals",color=Link) }
    }
    EarningsPeriod(period) { period=it }
    EarningsPulse(days,rides,period)
    InsightCard {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            EfficiencyMetric("Per recorded hour",if(pricedMinutes>0) usd(drivingNet*60/pricedMinutes) else "—",if(drivingNet<0) Danger else Income,Modifier.weight(1f))
            EfficiencyMetric("Net per priced mile",if(pricedMiles>0) usd(drivingNet/pricedMiles) else "—",if(drivingNet<0) Danger else Income,Modifier.weight(1f))
            EfficiencyMetric("Drives priced","${priced.size}/${rides.size}",Route,Modifier.weight(1f))
        }
    }
    MileageMix(rides,goals)
    val weekFirst=last.with(TemporalAdjusters.previousOrSame(java.time.temporal.WeekFields.of(java.util.Locale.getDefault()).firstDayOfWeek)).toString()
    val weekly=insights(records,goals,weekFirst,through)
    val weeklyRides=records.filter { it.kind=="trip" && it.date in weekFirst..through && it.trip().classification=="business" && it.trip().endedAt!=null }.map { RideProfit(it,goals) }
    InsightCard(title="Your net driving goals") {
        goals.dailyNetCents?.takeIf { it>0 }?.let { GoalBar("Today",weekly.firstOrNull { it.date==through }?.net ?: 0,it) }
        goals.weeklyNetCents?.takeIf { it>0 }?.let { GoalBar("This calendar week",weekly.sumOf { it.net },it) }
        if(goals.dailyNetCents==null && goals.weeklyNetCents==null) TextButton(onClick=onGoals) { Text("Set my goals & vehicle cost",color=Link) }
        Text("Progress uses completed business drives with all profit details. ${weeklyRides.count { it.net==null }} drives this week still need details. Estimated profit can change after review.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    if(totals.isEmpty()) InsightCard(title="Your numbers, as you drive") {
        Text("Add fares to completed business trips and record income and expenses. Your charts will grow from those records.",color=Muted)
    }
    InsightCard(title="Money in & money out") {
        EarningsAmount("Recorded income",days.sumOf { it.income },Income)
        EarningsAmount("Business expenses",days.sumOf { it.expenses },ExpenseColor)
        val cashflow=days.sumOf { it.income-it.expenses }; EarningsAmount("Recorded cash flow",cashflow,if(cashflow<0) Danger else Income)
        RecordedBars(days,days.map { it.income.toDouble() },days.map { it.expenses.toDouble() },Income,ExpenseColor,"income","expenses",210)
        Row(horizontalArrangement=Arrangement.spacedBy(16.dp)) { Text("● Income",color=Income,style=MaterialTheme.typography.bodySmall); Text("● Expenses",color=ExpenseColor,style=MaterialTheme.typography.bodySmall) }
        Text("Business expenses use the recorded business-use share, or 100% when blank. Personal and unclassified expenses are excluded. Cash flow follows entry dates; payouts can cover earlier rides.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    InsightCard(title="Fuel & charging",accent=ExpenseColor) {
        Text(usd(days.sumOf { it.fuel }),fontSize=28.sp,fontWeight=FontWeight.Bold,color=ExpenseColor)
        RecordedBars(days,days.map { it.fuel.toDouble() },color=ExpenseColor,label="fuel & charging",height=150)
        Text("Recorded business fuel and charging purchases. A fill-up can cover several days, so this is spending—not fuel consumed by an individual ride.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    InsightCard(title="Estimated driving profit",accent=if(drivingNet<0) Danger else Income) {
        Text(usd(drivingNet),fontSize=28.sp,fontWeight=FontWeight.Bold,color=if(drivingNet<0) Danger else Income)
        Text("${priced.size} of ${rides.size} completed business drives have fares, fees and a vehicle-cost estimate.")
        RecordedBars(days,days.map { it.net.toDouble() },color=Income,label="estimated driving net",height=180)
        Text("Fare + tips − platform fees − miles × your vehicle cost. Fuel, repairs and other vehicle costs belong in that per-mile estimate; recorded expenses are not subtracted again. Excludes income tax and costs outside your estimate. Bank payouts are not added to ride fares.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    InsightCard(title="Where money may be slipping away",accent=ExpenseColor) {
        Text("%.1f miles without a paid ride".format(rides.filter { it.record.trip().rideRole=="reposition" }.sumOf { it.miles }),color=ExpenseColor)
        Text("Mark travel to pickups and repositioning separately. Include that time and distance when comparing your working day; paid-trip hourly rates alone overstate it.",color=Muted,style=MaterialTheme.typography.bodySmall)
        if(goals.vehicleCostCentsPerMile==null) Text("Set your vehicle cost per mile to estimate wear, fuel and other operating costs.")
        val missing=rides.count { it.fare==null }; if(missing>0) Text("Add fares to $missing business drives to see their profitability.")
        val unreviewedTrips=records.count { it.kind=="trip" && it.date in first..through && it.trip().classification=="unclassified" }
        val unreviewedExpenses=records.count { it.kind=="expense" && it.date in first..through && it.expense().classification=="unclassified" }
        if(unreviewedTrips+unreviewedExpenses>0) Text("Classify $unreviewedTrips trips and $unreviewedExpenses expenses before counting them in these totals.")
        if(priced.any { it.record.trip().hasGaps }) Text("Some priced drives have GPS gaps. Review their mileage before relying on profit per mile.",color=Caution)
        Text("Open a GPS trip to compare current route options. A shorter route can save cost, but traffic, tolls and pickup requirements can change the better choice.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    for(grouping in listOf("Platforms","Areas you drove","Time of day")) InsightCard(title=grouping) {
        val groups=priced.filter { it.minutes>=1 }.groupBy { profit->val trip=profit.record.trip();when(grouping) {
            "Platforms"->trip.platform?.takeIf { it.isNotBlank() }?.replaceFirstChar { it.titlecase(java.util.Locale.getDefault()) } ?: "Unspecified"
            "Areas you drove"->trip.workArea?.takeIf { it.isNotBlank() } ?: "Unspecified"
            else->{ val hour=runCatching { Instant.parse(trip.startedAt).atZone(ZoneId.of(trip.timeZoneId ?: "UTC")).hour }.getOrDefault(0); "%02d:00–%02d:59".format(hour,hour) }
        }}.map { (name,values)->Triple(name,values.sumOf { it.net!!.toDouble() }/(values.sumOf { it.minutes }/60),values.size) }.sortedByDescending { it.second }.take(6)
        if(groups.isEmpty()) Text("Add completed business drives with fare and cost details to compare.",style=MaterialTheme.typography.bodySmall)
        else {
            val maximum=groups.maxOf { abs(it.second) }.coerceAtLeast(1.0)
            groups.forEach { group->
                Column(verticalArrangement=Arrangement.spacedBy(5.dp)) {
                    Text("${group.first}: ${usd(group.second)}/hr · ${group.third} drives",color=if(group.second<0) Danger else Color.White,style=MaterialTheme.typography.bodySmall)
                    Canvas(Modifier.fillMaxWidth().height(12.dp).semantics { contentDescription="${group.first}, ${usd(group.second)} estimated net per driving hour" }) {
                        drawRoundRect(if(group.second<0) Danger else Income,size=Size((size.width*abs(group.second)/maximum).toFloat(),size.height),cornerRadius=CornerRadius(3.dp.toPx()))
                    }
                }
            }
        }
        Text("Estimated net per recorded driving hour, weighted by time. Includes only priced drives; missing idle time and unlogged rides affect comparisons. This describes your records, not a prediction.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    val lowRides=priced.filter { it.net!!<0 || (goals.targetHourlyCents?.let { target->(it.hourly ?: Double.POSITIVE_INFINITY)<target }==true) }.sortedBy { it.hourly ?: Double.POSITIVE_INFINITY }
    if(lowRides.isNotEmpty()) InsightCard(title="Rides below your goal",accent=if(lowRides.any { it.net!!<0 }) Danger else Caution) {
        lowRides.take(8).forEach { ride->TextButton(onClick={onTrip(ride.record)}) {
            Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                Text(ride.record.title,color=Color.White)
                Text("${usd(ride.net!!)} estimated net · ${ride.hourly?.let { usd(it)+"/hr" } ?: "Time unavailable"}",color=if(ride.net!!<0) Danger else Caution,style=MaterialTheme.typography.bodySmall)
            }
        } }
    }
}

@Composable private fun InsightCard(title:String?=null,accent:Color=Pink,content:@Composable ColumnScope.()->Unit) {
    val shape=RoundedCornerShape(22.dp)
    Column(Modifier.fillMaxWidth().background(panelGradient,shape).border(.8.dp,Brush.linearGradient(listOf(accent.copy(alpha=.7f),Purple.copy(alpha=.4f),Border.copy(alpha=.25f))),shape).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        title?.let { Text(it,fontSize=17.sp,fontWeight=FontWeight.SemiBold) };content()
    }
}
@Composable private fun EarningsPeriod(value:Int,changed:(Int)->Unit) {
    Row(Modifier.fillMaxWidth().background(Color(0xFF20232A),RoundedCornerShape(50)).padding(2.dp)) {
        listOf(7,30,90).forEach { days->
            Box(Modifier.weight(1f).heightIn(min=32.dp).clip(RoundedCornerShape(50)).background(if(days==value) Color(0xFF5C5F67) else Color.Transparent)
                .selectable(selected=days==value,role=Role.Tab,onClick={changed(days)}).padding(vertical=6.dp),contentAlignment=Alignment.Center) { Text("$days days",fontSize=15.sp) }
        }
    }
}
@Composable private fun EfficiencyMetric(title:String,value:String,tint:Color,modifier:Modifier=Modifier) {
    Column(modifier,verticalArrangement=Arrangement.spacedBy(5.dp)) { Text(value,fontSize=20.sp,fontWeight=FontWeight.Bold,color=tint);Text(title,color=Muted,fontSize=12.sp,lineHeight=15.sp) }
}
@Composable private fun EarningsAmount(label:String,value:Long,color:Color) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically) {
        Text(label,Modifier.weight(1f));Text(usd(value),color=color)
    }
}
@Composable private fun EarningsPulse(days:List<DayTotals>,rides:List<RideProfit>,period:Int) {
    var metric by remember { mutableStateOf("Net earnings") };var expanded by remember { mutableStateOf(false) };var selected by remember(period,metric) { mutableStateOf<Int?>(null) }
    fun value(day:DayTotals):Double=when(metric) { "Miles"->day.miles;"Driving hours"->rides.filter { it.record.date==day.date }.sumOf { it.minutes }/60;else->day.net/100.0 }
    val values=days.map(::value);val total=values.sum();val shown=selected?.let { values[it] } ?: total
    val tint=when(metric) { "Miles"->Route;"Driving hours"->Link;else->if(total<0) Danger else Income }
    fun format(number:Double)=when(metric) { "Miles"->"%.1f mi".format(number);"Driving hours"->"%.1f hr".format(number);else->usd(number*100) }
    InsightCard(accent=tint) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically) {
            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)) {
                Text(selected?.let { days[it].date } ?: "Your last $period days",color=Muted,style=MaterialTheme.typography.bodySmall)
                Text(format(shown),fontSize=31.sp,fontWeight=FontWeight.Bold,color=if(metric=="Net earnings" && shown<0) Danger else tint)
            }
            Box {
                TextButton(onClick={expanded=true}) { Text("$metric ⌃",color=tint,fontSize=16.sp) }
                DropdownMenu(expanded,onDismissRequest={expanded=false},containerColor=Panel) { listOf("Net earnings","Miles","Driving hours").forEach { name->DropdownMenuItem(text={Text(name)},onClick={metric=name;expanded=false}) } }
            }
        }
        if(rides.isEmpty()) Column(Modifier.heightIn(min=120.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
            Text("Your graph starts with your first drive",fontWeight=FontWeight.Medium)
            Text("Completed drives, fares and your vehicle cost power these numbers.",color=Muted,style=MaterialTheme.typography.bodySmall)
        } else {
            EarningsLine(days,values,tint,selected,{ selected=it },metric,::format)
            if(selected!=null) TextButton(onClick={selected=null}) { Text("Show all $period days",color=Link) }
        }
        Text(if(metric=="Net earnings") "Priced business drives after fees and your per-mile cost. Includes recorded unpaid driving; excludes tax and unrecorded idle time." else "Completed business drives only. Missing trips and idle time affect this picture.",color=Muted,fontSize=12.sp,lineHeight=16.sp)
    }
}
@Composable private fun EarningsLine(days:List<DayTotals>,values:List<Double>,tint:Color,selected:Int?,select:(Int)->Unit,metric:String,format:(Double)->String) {
    val low=min(0.0,values.minOrNull() ?: 0.0);val high=max(0.0,values.maxOrNull() ?: 0.0).let { if(it<=low) low+1 else it*1.12 };val span=high-low
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)) {
        Canvas(Modifier.weight(1f).height(195.dp).pointerInput(values) { detectTapGestures { offset->select((offset.x/size.width*(values.size-1)).roundToInt().coerceIn(values.indices)) } }
            .pointerInput(values) { detectHorizontalDragGestures { change,_->select((change.position.x/size.width*(values.size-1)).roundToInt().coerceIn(values.indices));change.consume() } }
            .semantics {
                contentDescription="$metric over ${days.size} days. "+(selected?.let { days[it].date+", "+format(values[it]) } ?: "Touch a day to inspect its recorded value.")
                customActions=listOf(CustomAccessibilityAction("Previous day") { select(((selected ?: values.size)-1).coerceIn(values.indices));true },CustomAccessibilityAction("Next day") { select(((selected ?: -1)+1).coerceIn(values.indices));true })
            }) {
            fun y(value:Double)=((high-value)/span*size.height).toFloat()
            repeat(3) { index->val line=size.height*index/2;drawLine(Color.White.copy(alpha=.07f),Offset(0f,line),Offset(size.width,line),1f) }
            val points=values.mapIndexed { index,value->Offset(index*size.width/(values.size-1).coerceAtLeast(1),y(value)) }
            val line=Path();line.moveTo(points.first().x,points.first().y)
            // Monotone cubic interpolation keeps the curve within each pair of recorded values.
            val slopes=points.zipWithNext { a,b->(b.y-a.y)/(b.x-a.x).coerceAtLeast(.001f) }
            val tangent=points.indices.map { i->when(i) { 0->slopes.first();points.lastIndex->slopes.last();else->if(slopes[i-1]*slopes[i]<=0) 0f else 2f/(1f/slopes[i-1]+1f/slopes[i]) } }
            points.zipWithNext().forEachIndexed { i,(a,b)->val dx=(b.x-a.x)/3;line.cubicTo(a.x+dx,a.y+dx*tangent[i],b.x-dx,b.y-dx*tangent[i+1],b.x,b.y) }
            val area=Path().apply { addPath(line);lineTo(size.width,y(0.0));lineTo(0f,y(0.0));close() }
            drawPath(area,Brush.verticalGradient(listOf(tint.copy(alpha=.5f),tint.copy(alpha=.03f))))
            drawPath(line,tint,style=Stroke(2.5.dp.toPx(),cap=StrokeCap.Round))
            selected?.let { val p=points[it];drawLine(tint.copy(alpha=.7f),Offset(p.x,0f),Offset(p.x,size.height),1.dp.toPx(),pathEffect=PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(),3.dp.toPx())));drawCircle(if(values[it]<0) Danger else tint,4.dp.toPx(),p) }
        }
        Column(Modifier.widthIn(min=28.dp).height(195.dp),verticalArrangement=Arrangement.SpaceBetween,horizontalAlignment=Alignment.End) {
            listOf(high,(high+low)/2,low).forEach { Text(if(abs(it)>=1000) "%.0fk".format(it/1000) else "%.0f".format(it),fontSize=10.sp,color=Muted.copy(alpha=.6f)) }
        }
    }
    ChartDayLabels(days)
}
@Composable private fun ChartDayLabels(days:List<DayTotals>) {
    val positions=(0..min(6,days.lastIndex)).map { (it*days.lastIndex/min(6,days.lastIndex).coerceAtLeast(1).toDouble()).roundToInt() }.distinct()
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { positions.forEach { index->Text(LocalDate.parse(days[index].date).format(java.time.format.DateTimeFormatter.ofPattern("EEE")),fontSize=10.sp,color=Muted.copy(alpha=.65f)) } }
}
@Composable private fun RecordedBars(days:List<DayTotals>,values:List<Double>,second:List<Double> = emptyList(),color:Color=Income,secondColor:Color=ExpenseColor,label:String,secondLabel:String="",height:Int=180) {
    var selected by remember(days.size,label) { mutableStateOf<Int?>(null) }
    Bars(values,second,color,secondColor,height,Modifier.pointerInput(values,second) { detectTapGestures { offset->selected=(offset.x/size.width*values.size).toInt().coerceIn(values.indices) } }
        .semantics {
            contentDescription=days.indices.joinToString(". ") { "${days[it].date}: ${usd(values[it])} $label"+(second.getOrNull(it)?.let { amount->", ${usd(amount)} $secondLabel" } ?: "") }
        })
    ChartDayLabels(days)
    selected?.let { index->Text("${days[index].date}: ${usd(values[index])} $label"+(second.getOrNull(index)?.let { ", ${usd(it)} $secondLabel" } ?: ""),style=MaterialTheme.typography.bodySmall,color=Muted) }
}
@Composable fun Bars(values:List<Double>,second:List<Double> = emptyList(),color:Color=Income,secondColor:Color=ExpenseColor,height:Int=140,modifier:Modifier=Modifier) {
    Canvas(modifier.fillMaxWidth().height(height.dp)) {
        val maximum=(values+second).maxOfOrNull { abs(it) }?.coerceAtLeast(1.0) ?: 1.0
        val negative=(values+second).any { it<0 };val baseline=if(negative) size.height/2 else size.height;val scale=if(negative) size.height/2 else size.height
        drawLine(Muted.copy(alpha=.3f),Offset(0f,baseline),Offset(size.width,baseline),1f)
        val unit=size.width/values.size.coerceAtLeast(1)
        values.forEachIndexed { i,value->val h=(abs(value)/maximum*scale).toFloat();val width=unit*(if(second.isEmpty()) .7f else .35f)
            drawRect(if(value<0) Danger else color,Offset(i*unit,if(value>=0) baseline-h else baseline),Size(width,h))
            second.getOrNull(i)?.let { cost->val other=(abs(cost)/maximum*scale).toFloat();drawRect(if(cost<0) Danger else secondColor,Offset(i*unit+width,if(cost>=0) baseline-other else baseline),Size(width,other)) }
        }
    }
}
@Composable private fun MileageMix(rides:List<RideProfit>,goals:Goals) {
    val paid=rides.filter { it.record.trip().rideRole in listOf("ride","delivery","shopping") }.sumOf { it.miles }
    val unpaid=rides.filter { it.record.trip().rideRole=="reposition" }.sumOf { it.miles }
    val other=rides.filter { it.record.trip().rideRole=="other" }.sumOf { it.miles };val total=paid+unpaid+other
    InsightCard(title="Make every mile count",accent=Route) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(18.dp)) {
            if(total>0) Box(Modifier.size(115.dp),contentAlignment=Alignment.Center) {
                Canvas(Modifier.fillMaxSize().semantics { contentDescription="%.1f paid miles, %.1f unpaid miles, %.1f other miles".format(paid,unpaid,other) }) {
                    var start=-90f;listOf(paid to Route,unpaid to ExpenseColor,other to Color.Gray).filter { it.first>0 }.forEach { (amount,tint)->val sweep=(amount/total*360).toFloat();drawArc(tint,start+1.5f,(sweep-3).coerceAtLeast(.1f),false,topLeft=Offset(8.dp.toPx(),8.dp.toPx()),size=Size(size.width-16.dp.toPx(),size.height-16.dp.toPx()),style=Stroke(12.dp.toPx(),cap=StrokeCap.Round));start+=sweep }
                }
                Column(horizontalAlignment=Alignment.CenterHorizontally) { Text("%.0f%%".format(unpaid/total*100),fontSize=23.sp,fontWeight=FontWeight.Bold,color=if(unpaid>0) ExpenseColor else Route);Text("unpaid",color=Muted,fontSize=12.sp) }
            }
            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                Text("● %.1f paid miles".format(paid),color=Route,style=MaterialTheme.typography.bodySmall)
                Text("● %.1f unpaid miles".format(unpaid),color=ExpenseColor,style=MaterialTheme.typography.bodySmall)
                if(other>0) Text("● %.1f other miles".format(other),color=Color.Gray,style=MaterialTheme.typography.bodySmall)
                goals.vehicleCostCentsPerMile?.takeIf { it.isFinite() && it>=0 }?.let { Text("${usd(unpaid*it)} unpaid driving cost",color=ExpenseColor,fontWeight=FontWeight.Bold,style=MaterialTheme.typography.bodySmall) }
            }
        }
        Text("Mark trips to pickups and between jobs as unpaid driving to see their operating cost. This cost is already included in driving net.",color=Muted,fontSize=12.sp,lineHeight=16.sp)
    }
}
@Composable private fun GoalBar(label:String,net:Long,target:Int) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {Text(label,Modifier.weight(1f));Text("${usd(net)} / ${usd(target)}",color=if(net<0) Danger else Income)}
    LinearProgressIndicator(progress={(net.toFloat()/target).coerceIn(0f,1f)},Modifier.fillMaxWidth(),color=if(net>=target) Income else Link)
    Text(if(net>=target) "Recorded estimates have reached this goal." else "${usd(target-net)} to go based on recorded estimates.",color=if(net>=target) Income else Muted,style=MaterialTheme.typography.bodySmall)
}
@Composable fun GoalEditor(repo:DriverRepository,done:()->Unit) {
    val scope=repo.scope
    fun value(cents:Number?)=cents?.let { "%.2f".format(java.util.Locale.US,it.toDouble()/100) } ?: ""
    var daily by remember(scope) { mutableStateOf(value(repo.journal.goals.dailyNetCents)) };var weekly by remember(scope) { mutableStateOf(value(repo.journal.goals.weeklyNetCents)) }
    var hourly by remember(scope) { mutableStateOf(value(repo.journal.goals.targetHourlyCents)) };var cost by remember(scope) { mutableStateOf(value(repo.journal.goals.vehicleCostCentsPerMile)) }
    var error by remember(scope) { mutableStateOf<String?>(null) }
    Panel("Estimated net goals · USD") { Field("Daily net goal ($)",daily,{daily=it});Field("Weekly net goal ($)",weekly,{weekly=it});Field("Net per driving hour ($)",hourly,{hourly=it}) }
    Panel("Your vehicle operating estimate") {
        Field("Cost per mile ($)",cost,{cost=it})
        Text("Include fuel/charging, maintenance, tires, repairs, depreciation and allocated fixed vehicle costs. Enter your own estimate; this is not the tax mileage rate. For example, 0.50 means fifty cents per mile.",color=Muted,style=MaterialTheme.typography.bodySmall)
        Text("Changing this estimate recalculates all ride estimates. Goals and cost assumptions are stored on this phone; historical fares remain unchanged.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    error?.let { Text(it,color=Danger) }
    Action("Save",onClick={
        try {
            fun cents(raw:String):Int?=raw.trim().takeIf { it.isNotEmpty() }?.let { StatementImport.cents(it).also { amount->require(amount>=0) } }
            val vehicle=cents(cost)?.also { require(it<=10000) }
            val next=Goals(cents(daily),cents(weekly),cents(hourly),vehicle?.toDouble())
            check(repo.scope==scope) { "Your account changed. Open goals again." }
            repo.update { it.copy(goals=next) };done()
        } catch(failure:Exception) { error=if(failure is IllegalArgumentException || failure is ArithmeticException) "Use positive dollars and cents, or leave a field blank. Vehicle cost must be at most $100 per mile." else failure.message ?: "Goals could not be saved." }
    })
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
