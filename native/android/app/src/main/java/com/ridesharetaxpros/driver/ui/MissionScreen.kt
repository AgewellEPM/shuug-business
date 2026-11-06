package com.ridesharetaxpros.driver.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.*
import java.time.format.DateTimeFormatter

@Composable fun MissionScreen(repo: DriverRepository) {
    val mission=repo.journal.mission
    var target by remember { mutableStateOf(mission?.targetCents?.let { (it/100).toString() } ?: "100") }
    var date by remember { mutableStateOf(mission?.deadline?.let { Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalDate().toString() } ?: LocalDate.now().toString()) }
    var time by remember { mutableStateOf(mission?.deadline?.let { Instant.parse(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm")) } ?: "18:00") }
    var destination by remember { mutableStateOf(mission?.destination?.takeIf {it=="Home" || it=="Work"} ?: if(mission==null) "Home" else "Custom") }
    var customDestination by remember { mutableStateOf(mission?.destination?.takeUnless {it=="Home" || it=="Work"} ?: "") }
    var editing by remember { mutableStateOf(mission==null) }
    var payout by remember { mutableStateOf("") }; var fees by remember { mutableStateOf("0") }
    var pickup by remember { mutableStateOf("") }; var jobMiles by remember { mutableStateOf("") }
    var driving by remember { mutableStateOf("") }; var wait by remember { mutableStateOf("0") }
    var home by remember { mutableStateOf("") }; var homeMiles by remember { mutableStateOf("") }; var direct by remember { mutableStateOf("") }
    var homeNow by remember { mutableStateOf("") }; var homeAfter by remember { mutableStateOf("") }
    var restaurant by remember { mutableStateOf("") }; var observedWait by remember { mutableStateOf("") }
    var vehicleReserve by remember { mutableStateOf(repo.journal.vehicleReservePercent?.toString() ?: "") }
    var taxReserve by remember { mutableStateOf(repo.journal.taxReservePercent?.toString() ?: "") }
    var estimate by remember { mutableStateOf<OfferEstimate?>(null) }
    if(editing) Panel("Create today's mission") {
        Text("How much net do you want to earn?")
        Row(horizontalArrangement=Arrangement.SpaceEvenly,modifier=Modifier.fillMaxWidth()) { listOf("50","100","150","200").forEach { value -> TextButton(onClick={target=value}) { Text("$$value") } } }
        Field("Net target ($)",target,{target=it}); Field("Finish date (YYYY-MM-DD)",date,{date=it}); Field("Finish time (HH:mm)",time,{time=it})
        Choice("End at",destination,linkedMapOf("Home" to "Home","Work" to "Work","Custom" to "Custom")) {destination=it}
        if(destination=="Custom") Field("Destination label",customDestination,{customDestination=it.take(120)})
        Text("Destination is a label. This version uses the route estimates you enter; it does not find live offers or guarantee arrival.",color=Muted)
        Button(onClick={repo.run {
            val cents=StatementImport.cents(target); require(cents in 1..100_000_000) {"Enter a positive target."}
            val end=LocalDate.parse(date).atTime(LocalTime.parse(time)).atZone(ZoneId.systemDefault()).toInstant()
            require(end>Instant.now()) {"Choose a future finish time."}
            val label=if(destination=="Custom") customDestination.trim().also {require(it.isNotEmpty()) {"Enter a destination label."}} else destination
            repo.update {it.copy(mission=ShiftMission(cents,end.toString(),label,mission?.startedAt ?: now()))};editing=false;estimate=null
        }}) {Text("Start mission")}
    }
    if(mission!=null && !editing) {
        val records=repo.journal.visible.map {it.record}.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null && Instant.parse(it.trip().startedAt)>=Instant.parse(mission.startedAt)}
        val profit=records.map {RideProfit(it,repo.journal.goals)}; val priced=profit.filter {it.net!=null}; val net=priced.sumOf {it.net!!.toLong()}
        Panel("Your mission") {
            Text("Earn ${usd(mission.targetCents)} and finish by ${Instant.parse(mission.deadline).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))}",style=MaterialTheme.typography.titleLarge)
            Text("Final destination: ${mission.destination}")
            Text("${usd(net)} estimated net · ${usd((mission.targetCents-net).coerceAtLeast(0))} remaining")
            LinearProgressIndicator(progress={(net.toFloat()/mission.targetCents).coerceIn(0f,1f)},Modifier.fillMaxWidth(),color=Pink)
            Text("${profit.size-priced.size} completed business drives lack fare, fees or vehicle cost and are excluded. These are estimates, not payouts.",color=Muted)
            OutlinedButton(onClick={editing=true}) {Text("Change mission")}
            TextButton(onClick={repo.run {repo.update {it.copy(mission=null)}}}) {Text("End mission")}
        }
        val unpaid=profit.filter {it.record.trip().rideRole=="reposition"}.sumOf {it.miles}
        Panel("Dead Mile Killer") {
            Text("%.1f recorded unpaid miles this mission".format(unpaid))
            val rate=repo.journal.goals.vehicleCostCentsPerMile
            Text(if(rate==null) "Set a vehicle cost per mile in Insights to see the cost." else "Estimated vehicle cost ${usd(unpaid*rate)}")
            Text("Classify unpaid trips as business and choose Unpaid driving. Combine pickups or take an offer toward your destination when practical; unrecorded miles are not included.",color=Muted)
        }
        Panel("Evaluate an offer while parked") {
            Text("Enter an offer and current route estimates. No platform data is read automatically.",color=Muted)
            Field("Offered pay ($)",payout,{payout=it;estimate=null});Field("Platform fees ($)",fees,{fees=it;estimate=null})
            Field("Unpaid pickup miles",pickup,{pickup=it;estimate=null});Field("Job miles",jobMiles,{jobMiles=it;estimate=null})
            Field("Driving time including pickup (minutes)",driving,{driving=it;estimate=null});Field("Expected restaurant wait (minutes)",wait,{wait=it;estimate=null})
            Field("From drop-off to destination (minutes)",home,{home=it;estimate=null});Field("From drop-off to destination (miles)",homeMiles,{homeMiles=it;estimate=null});Field("Direct to destination now (minutes)",direct,{direct=it;estimate=null})
            Field("Distance to destination now, optional (miles)",homeNow,{homeNow=it;estimate=null});Field("Distance to destination after job, optional (miles)",homeAfter,{homeAfter=it;estimate=null})
            Button(onClick={repo.run {
                val cost=repo.journal.goals.vehicleCostCentsPerMile ?: error("Set your vehicle cost per mile in Insights first.")
                val hourly=repo.journal.goals.targetHourlyCents ?: error("Set your hourly target in Insights first.")
                fun optional(value:String)=value.takeIf {it.isNotBlank()}?.toDouble()
                estimate=estimateOffer(Offer(StatementImport.cents(payout),StatementImport.cents(fees),pickup.toDouble(),jobMiles.toDouble(),driving.toDouble(),wait.toDouble(),home.toDouble(),homeMiles.toDouble(),direct.toDouble(),optional(homeNow),optional(homeAfter)),mission,cost,hourly)
            }}) {Text("Calculate offer")}
            estimate?.let {result ->
                Text("${usd(result.netCents)} estimated net through destination · ${usd(result.hourlyCents)}/hour including return",style=MaterialTheme.typography.titleMedium)
                Text("Minimum offer for your hourly goal: ${usd(result.minimumPayoutCents)}")
                Text("Unpaid pickup and onward trip cost about ${usd(result.deadMileCostCents)}")
                Text(if(result.deadlineMarginMinutes>=0) "Estimated arrival margin: %.0f minutes".format(result.deadlineMarginMinutes) else "Estimated arrival: %.0f minutes late".format(-result.deadlineMarginMinutes))
                Text(if(result.additionalMinutesVsDirect>=0) "Job and return add %.0f minutes compared with going directly.".format(result.additionalMinutesVsDirect) else "Job and return take %.0f fewer minutes than your direct estimate; check your inputs.".format(-result.additionalMinutesVsDirect))
                result.homeProgressMiles?.let { Text(if(it>=0) "Drop-off is %.1f miles closer to your destination".format(it) else "Drop-off is %.1f miles farther from your destination".format(-it)) }
                Text("Includes pickup, job, wait and onward travel in cost and hourly rate. Direct trip: $direct minutes. Traffic and waits can change.",color=Muted)
            }
        }
        Panel("Restaurant wait history") {
            Text("Record your own actual waits, then use the average in an offer estimate.",color=Muted)
            Field("Pickup location",restaurant,{restaurant=it.take(160)});Field("Actual wait (minutes)",observedWait,{observedWait=it})
            averageWait(repo.journal.waitSamples,restaurant)?.let { (average,count)->
                Text("Your average: %.1f minutes from %d recorded waits".format(average,count))
                TextButton(onClick={wait="%.1f".format(java.util.Locale.US,average);estimate=null}) {Text("Use this wait in offer")}
            }
            Button(onClick={repo.run {val minutes=observedWait.toDouble();require(restaurant.isNotBlank() && minutes.isFinite() && minutes in 0.0..240.0) {"Enter a location and wait from 0 to 240 minutes."}
                repo.update {it.copy(waitSamples=(it.waitSamples+WaitSample(restaurant.trim(),minutes)).takeLast(1000))};observedWait=""
            }}) {Text("Save actual wait")}
        }
        Panel("Where has your time paid off?") {
            val groups=profit.filter {it.net!=null && it.minutes>=1}.groupBy {it.record.trip().platform?.ifBlank {"Unspecified"} ?: "Unspecified"}
            if(groups.isEmpty()) Text("Add completed business trips with platform, fares, fees and costs to compare platforms.")
            groups.map { (name,rows)-> Triple(name,rows.sumOf {it.net!!.toDouble()}/(rows.sumOf {it.minutes}/60),rows.size) }.sortedByDescending {it.second}.forEach { (name,hourly,count)->Text("$name · ${usd(hourly)}/hour · $count drives") }
            Text("Your own recorded sample, not live demand or a guarantee. Waiting between trips may not be included.",color=Muted)
        }
        val history=repo.journal.visible.map {it.record}.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}
            .map {RideProfit(it,repo.journal.goals)}.filter {it.net!=null && it.minutes>=1}
        Panel("Shift planner & opportunity areas") {
            if(history.size<3) Text("Record at least three priced business drives to compare your history. No live demand feed is connected.")
            else {
                history.groupBy { row ->
                    val trip=row.record.trip(); val hour=Instant.parse(trip.startedAt).atZone(ZoneId.of(trip.timeZoneId ?: "UTC")).hour
                    "${trip.workArea?.takeIf {it.isNotBlank()} ?: "Unspecified area"} · ${hour.toString().padStart(2,'0')}:00"
                }.map { (name,rows)->Triple(name,rows.sumOf {it.net!!.toDouble()}/(rows.sumOf {it.minutes}/60),rows.size) }
                    .sortedByDescending {it.second}.take(8).forEach { (name,rate,count)->Text("$name · ${usd(rate)}/hour · $count drives") }
                val hourly=history.sumOf {it.net!!.toDouble()}/(history.sumOf {it.minutes}/60)
                Text("Two-hour scenario at your recorded rate: ${usd(hourly*2)} estimated net from ${history.size} drives.")
                Text("Historical driving time only; idle time, traffic, demand and changing costs may make the next shift very different. Areas are labels, not a live map.",color=Muted)
            }
        }
        Panel("Reserve planning") {
            Text("Choose your own percentages; these are planning estimates and do not move money or determine tax deductions.",color=Muted)
            Field("Vehicle health fund (% of recorded income)",vehicleReserve,{vehicleReserve=it})
            Field("Tax reserve (% of positive estimated net)",taxReserve,{taxReserve=it})
            Button(onClick={repo.run {
                fun percent(value: String)=value.takeIf {it.isNotBlank()}?.toDouble()?.also {require(it.isFinite() && it in 0.0..100.0) {"Enter a percentage between 0 and 100."}}
                val v=percent(vehicleReserve);val t=percent(taxReserve);repo.update {it.copy(vehicleReservePercent=v,taxReservePercent=t)}
            }}) {Text("Save reserve rates")}
            val startDay=day(mission.startedAt,ZoneId.systemDefault().id)
            val income=repo.journal.visible.map {it.record}.filter {it.kind=="income" && it.income().date>=startDay}.sumOf {it.income().amountCents.toLong()}
            repo.journal.vehicleReservePercent?.let {Text("Vehicle fund: ${usd(income*it/100)} from ${usd(income)} recorded income on mission dates.")}
            repo.journal.taxReservePercent?.let {Text("Tax planning: ${usd(net.coerceAtLeast(0)*it/100)} from ${usd(net.coerceAtLeast(0))} estimated mission ride net.")}
            Text("Your tax situation may differ. Review estimates with your tax preparer; missing records and unpriced drives are excluded.",color=Muted)
        }
    }
}
