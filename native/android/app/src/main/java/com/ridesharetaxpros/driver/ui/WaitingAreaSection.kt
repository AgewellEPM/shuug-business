package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.location.Location
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlin.math.*
import kotlinx.coroutines.*

@Composable internal fun WaitingAreaSection(repo: DriverRepository,originLocation: Location,destination: PositionPoint) {
    val scope=repo.scope;val context=LocalContext.current;val coroutine=rememberCoroutineScope()
    val key="${originLocation.time}|$destination"
    var direct by remember(scope,key) {mutableStateOf<PositionRoad?>(null)}
    var matches by remember(scope,key) {mutableStateOf<List<PositionedArea>>(emptyList())}
    var busy by remember(scope,key) {mutableStateOf(false)}
    var status by remember(scope,key) {mutableStateOf("Use your completed jobs to find starts that have taken you toward this destination.")}
    var error by remember(scope,key) {mutableStateOf<String?>(null)}
    var generation by remember(scope,key) {mutableIntStateOf(0)}
    var job by remember(scope,key) {mutableStateOf<Job?>(null)}
    fun invalidate() {generation++;job?.cancel();busy=false;error=null}
    fun run(block: suspend (Int)->Unit) {
        invalidate();val revision=generation;busy=true
        job=coroutine.launch {try {block(revision)} catch(cancelled: CancellationException) {throw cancelled}
            catch(problem: Exception) {if(revision==generation && repo.scope==scope) error=problem.message ?: "The comparison could not finish. Try again."}
            finally {if(revision==generation && repo.scope==scope) busy=false}}
    }
    DisposableEffect(scope,key) {onDispose {job?.cancel()}}
    Panel("Position yourself toward home") {
        Action("Find waiting areas from my job history",{
            direct=null;matches=emptyList()
            val origin=originLocation;val selectedPoint=destination
            run {run->
                require(Duration.between(Instant.ofEpochMilli(origin.time),Instant.now()).seconds in 0..120) {"Update your current location before finding waiting areas."}
                val start=PositionPoint(origin.latitude,origin.longitude)
                val road=PositionRoadService.route(scope,start,selectedPoint)
                if(run!=generation || repo.scope!=scope) return@run
                direct=road
                val cost=repo.journal.goals.vehicleCostCentsPerMile
                val hourly=repo.journal.goals.targetHourlyCents
                if(cost==null || !cost.isFinite() || cost !in 0.0..10000.0 || hourly==null || hourly<=0) {
                    status="Your direct road route is shown. Set vehicle cost and an hourly target in Earnings before comparing waiting areas."
                    return@run
                }
                status="Checking your recorded jobs and road routes…"
                val records=repo.journal.visible.map {it.record}.take(500)
                val history=withContext(Dispatchers.IO) {
                    records.mapNotNull {record->
                        ensureActive()
                        if(record.kind!="trip") return@mapNotNull null
                        val trip=record.trip()
                        if(trip.classification!="business" || trip.rideRole !in listOf("ride","delivery") ||
                            trip.automaticallyDetected==true || trip.hasGaps || trip.endedAt==null) return@mapNotNull null
                        val profit=RideProfit(record,Goals(vehicleCostCentsPerMile=cost));val net=profit.net ?: return@mapNotNull null
                        val route=runCatching {repo.store.route(scope,record.id)}.getOrNull() ?: return@mapNotNull null
                        if(route.size<2 || route.drop(1).any {it.startsSegment==true}) return@mapNotNull null
                        val first=route.first();val last=route.last()
                        if(abs(Duration.between(Instant.parse(trip.startedAt),Instant.parse(first.timestamp)).seconds)>120 ||
                            abs(Duration.between(Instant.parse(trip.endedAt),Instant.parse(last.timestamp)).seconds)>120) return@mapNotNull null
                        HistoricalJob(PositionPoint(first.latitude,first.longitude),PositionPoint(last.latitude,last.longitude),
                            trip.workArea ?: "",net,profit.minutes,Instant.parse(trip.endedAt))
                    }
                }
                val candidates=historicalWaitingAreas(history,start,selectedPoint)
                val deadline=repo.journal.mission?.deadline?.let {Instant.parse(it)}
                val rows=mutableListOf<PositionedArea>()
                for(area in candidates.take(3)) {
                    currentCoroutineContext().ensureActive();if(run!=generation || repo.scope!=scope) return@run
                    val approach=PositionRoadService.route(scope,start,area.origin)
                    val onward=PositionRoadService.route(scope,area.dropoff,selectedPoint)
                    val reposition=BigDecimal.valueOf(approach.meters/1609.344).multiply(BigDecimal.valueOf(cost)).setScale(0,RoundingMode.HALF_UP).toInt()
                    val adjusted=area.averageNetCents-reposition
                    val rate=(adjusted*60/(area.averageMinutes+approach.seconds/60)).roundToInt()
                    val margin=deadline?.let {(Duration.between(Instant.now(),it).seconds-approach.seconds-area.averageMinutes*60-onward.seconds)/60}
                    if(road.meters-onward.meters>=500 && adjusted>0 && rate>=hourly && (margin==null || margin>=0))
                        rows+=PositionedArea(area,approach,onward,reposition,rate,margin)
                }
                if(run==generation && repo.scope==scope) {
                    matches=rows.sortedByDescending {it.hourlyCents}
                    status=if(rows.isEmpty()) "No supported waiting-area match yet. A nearby start needs three complete priced job routes, mostly toward your destination, meeting your target after positioning costs. Your direct road route is still available."
                        else "Personal-history matches after estimated positioning cost. Current job availability and waiting time are unknown."
                }
            }
        },enabled=!busy)
        if(BuildConfig.DEBUG) Text("Development preview: if no firm routing service is configured, deliberate route requests use the public OSRM demonstration. It has no live traffic or availability guarantee.",fontSize=11.sp,color=Muted)
        Text(status,fontSize=13.sp,color=Muted)
    }
    if(busy) {LinearProgressIndicator(modifier=Modifier.fillMaxWidth(),color=Pink);Action("Cancel waiting-area lookup",{invalidate()},primary=false)}
    error?.let {Text(it,color=Caution,fontSize=13.sp)}
    direct?.let {road->
        PositionRoadDiagram(repo,road,matches)
        Text(String.format(Locale.US,"Direct home: %.2f mi · about %d min",road.meters/1609.344,(road.seconds/60).roundToInt()),color=Route,fontSize=13.sp)
        Text("${road.provider} · Requested ${road.measuredAt}",fontSize=11.sp,color=Muted)
    }
    matches.forEachIndexed {index,row->Panel("${index+1} · ${row.area.name}") {
        Text("${row.area.matchingJobs} of ${row.area.totalJobs} eligible past jobs went toward this destination.",fontSize=13.sp)
        Text(String.format(Locale.US,"%.2f mi to position · %s estimated vehicle cost",row.approach.meters/1609.344,usd(row.repositionCents)),color=ExpenseColor,fontSize=13.sp)
        Text("${usd(row.hourlyCents)}/active hour using your matched history and positioning time.",color=Income)
        row.deadlineMarginMinutes?.let {Text("Illustrative ${it.toInt()} min deadline buffer if another job matched the recorded duration. Finding/waiting for a job is excluded.",fontSize=12.sp,color=Route)}
        Action("Open this waiting area in Maps",{
            try {context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("geo:${row.area.origin.latitude},${row.area.origin.longitude}?q=${row.area.origin.latitude},${row.area.origin.longitude}(${Uri.encode(row.area.name)})")))}
            catch(problem: Exception) {error="No maps app is installed to open this waiting area."}
        },primary=false)
    }}
    Text("Job availability, waiting and future routes are unknown. Historical matches are personal observations; they do not guarantee profitable offers or arrival. Choose a legal, safe place to wait.",fontSize=11.sp,color=Muted)
    Text("Road data © OpenStreetMap contributors. Road estimates can change; update your location and compare again after conditions change.",fontSize=11.sp,color=Muted)
}

@Composable private fun PositionRoadDiagram(repo: DriverRepository,road: PositionRoad,areas: List<PositionedArea>) {
    val markers=listOf(RoadMapMarker(road.points.first(),Color.White,"Current"),RoadMapMarker(road.points.last(),Pink,"Destination"))+
        areas.map {RoadMapMarker(it.area.origin,Income,it.area.name)}
    SharedRoadMap(repo,listOf(RoadMapLine(road.points,Route,"Direct route"))+
        areas.flatMap {listOf(RoadMapLine(it.approach.points,Income,"To waiting area"),RoadMapLine(it.onward.points,Route.copy(alpha=.6f),"From historical drop-off"))},markers,height=240.dp,description="Positioning and waiting-area road map")
    Text("White: current · Pink: destination · Green: waiting areas",fontSize=10.sp,color=Muted)
}
