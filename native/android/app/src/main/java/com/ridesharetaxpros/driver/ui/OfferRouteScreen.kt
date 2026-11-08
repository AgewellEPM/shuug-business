package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.*
import kotlinx.coroutines.*

private data class ChosenRoutePlace(val label: String,val point: PositionPoint)

/** All endpoints are explicitly selected; search terms and road results stay in this screen. */
@Composable fun OfferRouteScreen(repo: DriverRepository,offerId: String) {
    val scope=repo.scope;val context=LocalContext.current;val coroutine=rememberCoroutineScope()
    val offer=reviewedOffers(repo.journal).firstOrNull {it.id==offerId}
    if(offer==null) {Text("This offer is no longer saved on this phone.");return}
    var queries by remember(scope,offerId) {mutableStateOf(mapOf("Destination" to (repo.journal.mission?.destination ?: ""),"Offer pickup" to offer.pickup,"Offer drop-off" to offer.dropoff))}
    var chosen by remember(scope,offerId) {mutableStateOf<Map<String,ChosenRoutePlace>>(emptyMap())}
    var results by remember(scope,offerId) {mutableStateOf<Pair<String,List<ChosenRoutePlace>>?>(null)}
    var current by remember(scope,offerId) {mutableStateOf<Location?>(null)}
    var journey by remember(scope,offerId) {mutableStateOf<OfferRoadJourney?>(null)}
    var deadline by remember(scope,offerId) {mutableStateOf(runCatching {Instant.parse(repo.journal.mission?.deadline).atZone(ZoneId.systemDefault())}.getOrElse {ZonedDateTime.now().plusHours(1)})}
    var wait by remember(scope,offerId) {mutableStateOf(offer.waitMinutes?.toString() ?: "")}
    var delayAllowance by remember(scope,offerId) {mutableStateOf("")}
    var maxMiles by remember(scope,offerId) {mutableStateOf("10")}
    var maxMinutes by remember(scope,offerId) {mutableStateOf("30")}
    var confirmed by remember(scope,offerId) {mutableStateOf(false)}
    var conservative by remember(scope,offerId) {mutableStateOf(true)}
    var platforms by remember(scope,offerId) {mutableStateOf(gigPlatforms.keys.toSet())}
    var busy by remember(scope,offerId) {mutableStateOf<String?>(null)}
    var error by remember(scope,offerId) {mutableStateOf<String?>(null)}
    var version by remember(scope,offerId) {mutableIntStateOf(0)}
    var job by remember(scope,offerId) {mutableStateOf<Job?>(null)}
    val cache=remember(scope,offerId) {linkedMapOf<String,List<ChosenRoutePlace>>()}
    var clock by remember {mutableStateOf(Instant.now())}
    LaunchedEffect(Unit) {while(true) {delay(2000);clock=Instant.now()}}
    DisposableEffect(scope,offerId) {onDispose {job?.cancel()}}
    fun invalidate() {version++;job?.cancel();busy=null;journey=null;error=null}
    fun run(label: String,block: suspend (Int)->Unit) {
        invalidate();val revision=version;busy=label
        job=coroutine.launch {try {block(revision)} catch(cancelled: CancellationException) {throw cancelled}
            catch(problem: Exception) {if(version==revision && repo.scope==scope) error=problem.message ?: "This lookup could not finish. Try again."}
            finally {if(version==revision && repo.scope==scope) busy=null}}
    }
    fun locate() {run("location") {revision->
        val fix=recentPosition(context.getSystemService(LocationManager::class.java))
        if(version==revision && repo.scope==scope) current=fix
    }}
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {granted->
        if(granted[Manifest.permission.ACCESS_FINE_LOCATION]==true || granted[Manifest.permission.ACCESS_COARSE_LOCATION]==true) locate()
        else error="Allow location while using the app in Android Settings, then try again."
    }
    Panel {
        Text("Earn on your way home",color=Route,fontSize=25.sp,fontWeight=FontWeight.Bold)
        Text("Compare going directly with completing this entire job first. Confirm the pickup and drop-off in ${offer.platform} while parked.")
        Text("Android's place service receives your searches. Road routing receives only the endpoints of routes you request. Selected places stay in this screen and are not sent to your firm.",color=Muted,fontSize=12.sp)
    }
    Panel("Your destination & arrival") {
        Action(if(current==null) "Use my current location" else "Update my current location",{
            val granted=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
            if(granted) locate() else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))
        },primary=false,enabled=busy==null)
        current?.let {Text("Location measured ${Instant.ofEpochMilli(it.time)}; accuracy about ${it.accuracy.roundToInt()} m.",fontSize=11.sp,color=Muted)}
        NavigationRow("Must arrive by",{
            DatePickerDialog(context,{_,year,month,day->val selected=deadline.withDayOfMonth(1).withYear(year).withMonth(month+1).withDayOfMonth(day)
                TimePickerDialog(context,{_,hour,minute->deadline=selected.withHour(hour).withMinute(minute)},deadline.hour,deadline.minute,false).show()
            },deadline.year,deadline.monthValue-1,deadline.dayOfMonth).show()
        },deadline.format(DateTimeFormatter.ofPattern("MMM d, h:mm a")))
    }
    for(kind in listOf("Destination","Offer pickup","Offer drop-off")) Panel(kind) {
        Field("$kind address or place",queries[kind] ?: "",{value->queries=queries+(kind to value);chosen=chosen-kind;results=null;confirmed=false;invalidate()})
        Action("Search ${kind.lowercase()}",{
            val query=queries[kind]!!.trim();results=null;chosen=chosen-kind
            run("search:$kind") {revision->
                val matches=cache[query.lowercase()] ?: withContext(Dispatchers.IO) {
                    check(Geocoder.isPresent()) {"Place search is unavailable on this device. Check Android location services and your connection."}
                    @Suppress("DEPRECATION")
                    val addresses=Geocoder(context,Locale.getDefault()).getFromLocationName(query,5) ?: emptyList()
                    addresses.mapNotNull {address->
                        if(!address.hasLatitude() || !address.hasLongitude()) null else {
                            val point=PositionPoint(address.latitude,address.longitude)
                            if(!point.valid) null else ChosenRoutePlace((address.getAddressLine(0) ?: address.featureName ?: query).take(500),point)
                        }
                    }.distinctBy {it.point}
                }
                if(version==revision && repo.scope==scope) {
                    if(cache.size>=32) cache.remove(cache.keys.first())
                    cache[query.lowercase()]=matches;results=kind to matches
                    if(matches.isEmpty()) error="No matching place found. Try its full address."
                }
            }
        },primary=false,enabled=busy==null && !queries[kind].isNullOrBlank())
        if(results?.first==kind) {Text("Choose the correct result:",color=Link,fontSize=12.sp)
            results!!.second.forEach {place->TextButton(onClick={chosen=chosen+(kind to place);results=null;invalidate()}) {Text(place.label)}}}
        chosen[kind]?.let {Text("$kind: ${it.label}",color=Route,fontSize=13.sp)}
    }
    Panel("The complete job") {
        Field("Pickup/service wait · minutes",wait,{wait=it})
        Field("Additional delay allowance · minutes",delayAllowance,{delayAllowance=it})
        Text("Include loading, shopping and hand-off time in service wait. Enter an extra delay allowance, including 0 only when you assume no extra delay. It expands the upper travel-time estimate.",color=Muted,fontSize=12.sp)
        Toggle("Pickup, drop-off and home cover all remaining stops",confirmed,{confirmed=it})
        if((offer.repositionMiles ?: 0.0)>0) Text("This offer includes additional repositioning. Its extra stops must be routed before a complete recommendation is possible.",color=Caution,fontSize=12.sp)
    }
    Panel("Your limits") {
        Field("Maximum extra miles",maxMiles,{maxMiles=it});Field("Maximum extra minutes",maxMinutes,{maxMinutes=it})
        Choice("Uncertainty tolerance",if(conservative) "Conservative" else "Balanced",linkedMapOf("Conservative" to "Conservative","Balanced" to "Balanced")) {conservative=it=="Conservative"}
        Text("Both choices enforce your deadline using the latest estimated arrival. Conservative also rejects wide time ranges.",color=Muted,fontSize=12.sp)
        Text("Preferred platforms",fontWeight=FontWeight.SemiBold)
        gigPlatforms.keys.forEach {platform->Toggle(platform,platform in platforms,{allowed->platforms=if(allowed) platforms+platform else platforms-platform})}
    }
    Panel("Compare the alternatives") {
        Action("Calculate the full route",{
            val fix=current!!;val finish=chosen["Destination"]!!;val pickup=chosen["Offer pickup"]!!;val dropoff=chosen["Offer drop-off"]!!
            run("routes") {revision->
                require(Duration.between(Instant.ofEpochMilli(fix.time),Instant.now()).seconds in 0..120) {"Update your current location before comparing routes."}
                val origin=PositionPoint(fix.latitude,fix.longitude)
                val direct=PositionRoadService.route(scope,origin,finish.point)
                currentCoroutineContext().ensureActive()
                val toPickup=PositionRoadService.route(scope,origin,pickup.point)
                currentCoroutineContext().ensureActive()
                val delivery=PositionRoadService.route(scope,pickup.point,dropoff.point)
                currentCoroutineContext().ensureActive()
                val onward=PositionRoadService.route(scope,dropoff.point,finish.point)
                if(version==revision && repo.scope==scope) {journey=OfferRoadJourney(direct,toPickup,delivery,onward,Instant.ofEpochMilli(fix.time));clock=Instant.now()}
            }
        },enabled=busy==null && current!=null && chosen.size==3)
        if(BuildConfig.DEBUG) Text("Development preview: deliberate requests use the public OSRM demonstration if no approved routing service is configured. No live traffic guarantee.",fontSize=11.sp,color=Muted)
        busy?.let {LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink);Text(if(it=="routes") "Checking all four road legs…" else if(it=="location") "Finding current location…" else "Searching places…",color=Muted,fontSize=12.sp)
            Action("Cancel lookup",{invalidate()},primary=false)}
        error?.let {Text(it,color=Caution,fontSize=13.sp)}
    }
    journey?.let {roads->
        OfferRoadDiagram(roads)
        fun number(text: String)=text.trim().toDoubleOrNull() ?: Double.NaN
        val prefs=OfferRoadPreferences(deadline.toInstant(),number(wait),number(delayAllowance),number(maxMiles),number(maxMinutes),confirmed,conservative,platforms)
        val result=assessOfferRoad(offer,roads,prefs,repo.journal.goals,repo.journal.taxReservePercent ?: 0.0,
            reviewedOffers(repo.journal).any {it.id!=offer.id && it.isActiveWork()},clock)
        val tint=when(result.outcome) {"aligned","tradeoff"->Income;"skip"->Danger;else->Caution}
        Panel(when(result.outcome) {"aligned"->"Fits your journey";"tradeoff"->"Profitable route tradeoff";"skip"->"Skip this comparison";else->"More review needed"}) {
            Text(result.reason,color=tint,fontWeight=FontWeight.SemiBold,modifier=Modifier.testTag("offerRoute.result"))
            Text(String.format(Locale.US,"Go directly: %.1f mi · %.0f min",roads.direct.meters/1609.344,ceil(roads.direct.seconds/60)),color=Route)
            result.extraMiles?.let {Text(String.format(Locale.US,"Extra miles via this job: %+.1f mi",it),color=Route)}
            result.extraMinutes?.let {Text(String.format(Locale.US,"Extra time via this job: %+.1f to %+.1f min",it.first,it.second),color=Route)}
            result.latestArrival?.let {Text("Latest estimated arrival: ${it.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("h:mm a"))}",color=Route)}
            result.deadlineBufferMinutes?.let {Text("Deadline buffer: ${floor(it).toInt()} min",color=if(it<0) Danger else Route)}
            fun money(value: OfferMoneyBand?)=value?.let {if(it.lower==it.upper) usd(it.lower) else "${usd(it.lower)}–${usd(it.upper)}"} ?: "Unknown"
            Text("Job cash after reserve: ${money(result.financial?.cash)}")
            Text("Extra cash versus going directly: ${money(result.incrementalCash)}")
            Text("Operating costs and your configured reserve are included. Reserve is a planning allocation. Traffic, service delays and availability can change. Verify the actual offer in ${offer.platform} before accepting.",color=Muted,fontSize=12.sp)
        }
        Text("${roads.direct.provider} · Requested ${roads.direct.measuredAt}. Road data © OpenStreetMap contributors.",color=Muted,fontSize=11.sp)
    }
}

@Composable private fun OfferRoadDiagram(roads: OfferRoadJourney) {
    val legs=listOf(roads.direct,roads.pickup,roads.delivery,roads.onward)
    val all=legs.flatMap {it.points}
    Column(Modifier.fillMaxWidth().background(panelGradient,RoundedCornerShape(18.dp)).padding(14.dp)) {
        Text("Road route diagram",fontSize=12.sp,color=Link)
        Canvas(Modifier.fillMaxWidth().height(220.dp)) {
            fun project(p: PositionPoint)=Offset(p.longitude.toFloat(),(ln(tan(PI/4+p.latitude.coerceIn(-85.0,85.0)*PI/360))*180/PI).toFloat())
            val points=all.map(::project);val minX=points.minOf {it.x};val maxX=points.maxOf {it.x};val minY=points.minOf {it.y};val maxY=points.maxOf {it.y}
            val scale=min((size.width-36)/max(.0001f,maxX-minX),(size.height-36)/max(.0001f,maxY-minY))
            fun at(p: PositionPoint): Offset {val point=project(p);return Offset(size.width/2+(point.x-(minX+maxX)/2)*scale,size.height/2-(point.y-(minY+maxY)/2)*scale)}
            legs.forEachIndexed {index,leg->val path=Path();leg.points.forEachIndexed {i,p->val point=at(p);if(i==0) path.moveTo(point.x,point.y) else path.lineTo(point.x,point.y)}
                drawPath(path,when(index) {0->Purple.copy(alpha=.6f);3->Route;else->Pink},style=Stroke(width=(if(index==0) 3 else 4).dp.toPx()))}
            listOf(roads.pickup.points.first(),roads.pickup.points.last(),roads.delivery.points.last(),roads.onward.points.last()).forEachIndexed {i,p->drawCircle(if(i==0) Color.White else if(i==3) Route else Pink,6.dp.toPx(),at(p))}
        }
        Text("Purple: direct · Pink: pickup & delivery · Light: onward",fontSize=10.sp,color=Muted)
    }
}
