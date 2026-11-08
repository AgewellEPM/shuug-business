package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.*
import kotlinx.coroutines.*

private data class DestinationPlace(val name: String,val point: PositionPoint)

@Composable fun PositionScreen(repo: DriverRepository) {
    val context=LocalContext.current
    val scope=repo.scope
    val coroutine=rememberCoroutineScope()
    var query by remember(scope) {mutableStateOf("")}
    var current by remember(scope) {mutableStateOf<Location?>(null)}
    var destination by remember(scope) {mutableStateOf<DestinationPlace?>(null)}
    var places by remember(scope) {mutableStateOf<List<DestinationPlace>>(emptyList())}
    var direct by remember(scope) {mutableStateOf<PositionRoad?>(null)}
    var matches by remember(scope) {mutableStateOf<List<PositionedArea>>(emptyList())}
    var busy by remember(scope) {mutableStateOf(false)}
    var status by remember(scope) {mutableStateOf("Use your completed jobs to find starts that have taken you toward this destination.")}
    var error by remember(scope) {mutableStateOf<String?>(null)}
    var generation by remember(scope) {mutableIntStateOf(0)}
    var job by remember(scope) {mutableStateOf<Job?>(null)}
    val geocoderCache=remember(scope) {linkedMapOf<String,List<DestinationPlace>>()}
    fun invalidate() {generation++;job?.cancel();busy=false;direct=null;matches=emptyList();error=null}
    fun run(block: suspend (Int)->Unit) {
        job?.cancel();val run=++generation;busy=true;error=null
        job=coroutine.launch {
            try {block(run)}
            catch(cancelled: CancellationException) {throw cancelled}
            catch(problem: Exception) {if(run==generation && repo.scope==scope) error=problem.message ?: "The comparison could not finish. Try again."}
            finally {if(run==generation && repo.scope==scope) busy=false}
        }
    }
    fun locate() {
        invalidate()
        run {run->val fix=recentPosition(context.getSystemService(LocationManager::class.java))
            if(run==generation && repo.scope==scope) current=fix}
    }
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {allowed->
        if(allowed[Manifest.permission.ACCESS_FINE_LOCATION]==true || allowed[Manifest.permission.ACCESS_COARSE_LOCATION]==true) locate()
        else error="Allow location while using the app in Android Settings, then try again."
    }
    DisposableEffect(scope) {onDispose {job?.cancel()}}
    Panel {
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {Icon(Icons.Default.MyLocation,null,tint=Route);Text("Your best next move",fontSize=24.sp,fontWeight=FontWeight.Bold,color=Route)}
        Text("Wait where your past jobs have taken you toward home.",fontWeight=FontWeight.Bold)
        Text("Select the actual destination. We compare eligible job starts from your own saved routes, positioning costs and road travel. This does not predict live demand.",fontSize=13.sp,color=Muted)
    }
    Panel("Your destination") {
        Text("While parked, select your destination. Find matching job-start areas from your history. Open an offer's details to compare its pickup, drop-off and full route home.",fontSize=13.sp)
        Text("Android's place search receives your search terms. Road routing receives selected route endpoints, including historical job starts/drop-offs needed for comparisons. These lookups are not saved to your journal or sent to your firm.",fontSize=12.sp,color=Muted)
        Action(if(current==null) "Use my current location" else "Update my current location",{
            val granted=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
            if(granted) locate() else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))
        },primary=false,enabled=!busy)
        current?.let {Text("Location measured ${Instant.ofEpochMilli(it.time)}; accuracy about ${it.accuracy.roundToInt()} m.",fontSize=11.sp,color=Muted)}
        Field("Destination address or place",query,{query=it;destination=null;places=emptyList();invalidate()})
        Action("Search destination",{
            val requested=query.trim();places=emptyList();destination=null;invalidate()
            run {run->
                val candidates=geocoderCache[requested.lowercase()] ?: withContext(Dispatchers.IO) {
                    check(Geocoder.isPresent()) {"Place search is unavailable on this device. Check Android location services and your connection."}
                    @Suppress("DEPRECATION")
                    val addresses=Geocoder(context,Locale.getDefault()).getFromLocationName(requested,5) ?: emptyList()
                    addresses.mapNotNull {address->
                        val point=PositionPoint(address.latitude,address.longitude)
                        if(!address.hasLatitude() || !address.hasLongitude() || !point.valid) null else
                            DestinationPlace((address.getAddressLine(0) ?: address.featureName ?: requested).take(500),point)
                    }.distinctBy {it.point}
                }
                if(run==generation && repo.scope==scope) {
                    if(geocoderCache.size>=32) geocoderCache.remove(geocoderCache.keys.first())
                    geocoderCache[requested.lowercase()]=candidates;places=candidates
                    if(candidates.isEmpty()) error="No matching destination was found. Try a full address or a nearby place."
                }
            }
        },enabled=!busy && query.trim().isNotEmpty())
        if(places.isNotEmpty()) {
            Text("Choose the correct result:",fontSize=12.sp,color=Link)
            places.forEach {place->TextButton(onClick={destination=place;places=emptyList();invalidate()}) {Text(place.name)}}
        }
        destination?.let {Text("Destination: ${it.name}",fontSize=13.sp,color=Route)}
    }
    if(current!=null && destination!=null) Panel("Position yourself toward home") {
        Action("Find waiting areas from my job history",{
            direct=null;matches=emptyList()
            val origin=current!!;val selected=destination!!
            run {run->
                require(Duration.between(Instant.ofEpochMilli(origin.time),Instant.now()).seconds in 0..120) {"Update your current location before finding waiting areas."}
                val start=PositionPoint(origin.latitude,origin.longitude)
                val road=PositionRoadService.route(scope,start,selected.point)
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
                val candidates=historicalWaitingAreas(history,start,selected.point)
                val deadline=repo.journal.mission?.deadline?.let {Instant.parse(it)}
                val rows=mutableListOf<PositionedArea>()
                for(area in candidates.take(3)) {
                    currentCoroutineContext().ensureActive();if(run!=generation || repo.scope!=scope) return@run
                    val approach=PositionRoadService.route(scope,start,area.origin)
                    val onward=PositionRoadService.route(scope,area.dropoff,selected.point)
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
    if(busy) {LinearProgressIndicator(modifier=Modifier.fillMaxWidth(),color=Pink);Action("Cancel lookup",{invalidate()},primary=false)}
    error?.let {Text(it,color=Color(0xFFFFE66D),fontSize=13.sp)}
    direct?.let {road->
        PositionRoadDiagram(road,matches)
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

@Suppress("DEPRECATION")
internal suspend fun recentPosition(manager: LocationManager): Location = withTimeout(20000) {
    val providers=manager.getProviders(true)
    require(providers.isNotEmpty()) {"Turn on Android location services, then try again."}
    val recent=providers.mapNotNull {runCatching {manager.getLastKnownLocation(it)}.getOrNull()}
        .filter {Duration.between(Instant.ofEpochMilli(it.time),Instant.now()).seconds in 0..120 && it.accuracy in 0f..150f}
        .minByOrNull {it.accuracy}
    if(recent!=null) return@withTimeout recent
    val provider=if(LocationManager.GPS_PROVIDER in providers) LocationManager.GPS_PROVIDER else providers.first()
    suspendCancellableCoroutine {continuation->
        val listener=object: LocationListener {
            override fun onLocationChanged(location: Location) {
                if(!continuation.isActive) return
                if(Duration.between(Instant.ofEpochMilli(location.time),Instant.now()).seconds in 0..120 && location.accuracy in 0f..150f) {
                    manager.removeUpdates(this);continuation.resume(location)
                }
            }
            override fun onProviderDisabled(provider: String) {manager.removeUpdates(this);if(continuation.isActive) continuation.resumeWithException(IllegalStateException("Location was turned off. Enable it and try again."))}
            override fun onProviderEnabled(provider: String) {}
            override fun onStatusChanged(provider: String?,status: Int,extras: Bundle?) {}
        }
        continuation.invokeOnCancellation {manager.removeUpdates(listener)}
        try {manager.requestLocationUpdates(provider,1000L,0f,listener,Looper.getMainLooper())}
        catch(problem: Exception) {manager.removeUpdates(listener);if(continuation.isActive) continuation.resumeWithException(problem)}
    }
}

@Composable private fun PositionRoadDiagram(road: PositionRoad,areas: List<PositionedArea>) {
    val points=road.points+areas.flatMap {listOf(it.area.origin,it.area.dropoff)}
    Column(Modifier.fillMaxWidth().background(panelGradient,RoundedCornerShape(18.dp)).padding(14.dp)) {
        Text("Road route diagram",fontSize=12.sp,color=Link)
        Canvas(Modifier.fillMaxWidth().height(200.dp)) {
            fun mercator(p: PositionPoint)=Offset(p.longitude.toFloat(),ln(tan(Math.PI/4+p.latitude.coerceIn(-85.0,85.0)*Math.PI/360)).toFloat()*180/Math.PI.toFloat())
            val projected=points.map(::mercator);val minX=projected.minOf {it.x};val maxX=projected.maxOf {it.x}
            val minY=projected.minOf {it.y};val maxY=projected.maxOf {it.y}
            val scale=min((size.width-36)/max(.0001f,maxX-minX),(size.height-36)/max(.0001f,maxY-minY))
            fun drawPoint(point: PositionPoint): Offset {val p=mercator(point);return Offset(size.width/2+(p.x-(minX+maxX)/2)*scale,size.height/2-(p.y-(minY+maxY)/2)*scale)}
            val path=Path();road.points.forEachIndexed {index,p->val at=drawPoint(p);if(index==0) path.moveTo(at.x,at.y) else path.lineTo(at.x,at.y)}
            drawPath(path,Route,style=Stroke(width=4.dp.toPx()))
            drawCircle(Color.White,6.dp.toPx(),drawPoint(road.points.first()))
            drawCircle(Pink,7.dp.toPx(),drawPoint(road.points.last()))
            areas.forEach {drawCircle(Income,6.dp.toPx(),drawPoint(it.area.origin))}
        }
        Text("White: current · Pink: destination · Green: waiting areas",fontSize=10.sp,color=Muted)
    }
}
