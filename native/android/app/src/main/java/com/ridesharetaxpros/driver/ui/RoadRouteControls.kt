package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.*

private data class SelectedRoadPlace(val label: String,val point: PositionPoint)

/** Shared native selected-endpoint controls; no search or location request at startup. */
@Composable internal fun RoadRouteControls(repo: DriverRepository,stateKey: Any,initialPickup: String="",initialDropoff: String="",
    initialDestination: String="",showWaitingAreas: Boolean=false,onRoute: (OfferRoadJourney?)->Unit,beforeCompare: @Composable ()->Unit={}) {
    val scope=repo.scope;val context=LocalContext.current;val coroutine=rememberCoroutineScope()
    var queries by remember(scope,stateKey) {mutableStateOf(mapOf("Destination" to initialDestination,"Offer pickup" to initialPickup,"Offer drop-off" to initialDropoff))}
    var chosen by remember(scope,stateKey) {mutableStateOf<Map<String,SelectedRoadPlace>>(emptyMap())}
    var results by remember(scope,stateKey) {mutableStateOf<Pair<String,List<SelectedRoadPlace>>?>(null)}
    var current by remember(scope,stateKey) {mutableStateOf<Location?>(null)}
    var busy by remember(scope,stateKey) {mutableStateOf<String?>(null)}
    var error by remember(scope,stateKey) {mutableStateOf<String?>(null)}
    var version by remember(scope,stateKey) {mutableIntStateOf(0)}
    var job by remember(scope,stateKey) {mutableStateOf<Job?>(null)}
    val receive by rememberUpdatedState(onRoute)
    val cache=remember(scope,stateKey) {linkedMapOf<String,List<SelectedRoadPlace>>()}
    DisposableEffect(scope,stateKey) {onDispose {job?.cancel()}}
    fun invalidate() {version++;job?.cancel();busy=null;error=null;receive(null)}
    fun run(label: String,block: suspend (Int)->Unit) {
        invalidate();val revision=version;busy=label
        job=coroutine.launch {try {block(revision)} catch(cancelled: CancellationException) {throw cancelled}
            catch(problem: Exception) {if(version==revision && repo.scope==scope) error=problem.message ?: "This lookup could not finish. Try again."}
            finally {if(version==revision && repo.scope==scope) busy=null}}
    }
    fun locate() {run("location") {revision->val fix=recentPosition(context.getSystemService(LocationManager::class.java))
        if(version==revision && repo.scope==scope) current=fix}}
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {granted->
        if(granted[Manifest.permission.ACCESS_FINE_LOCATION]==true || granted[Manifest.permission.ACCESS_COARSE_LOCATION]==true) locate()
        else error="Allow location while using Gig Tax Pros in Android Settings, then try again."
    }
    Panel("Your location") {
        Text("While parked, select the actual destination, pickup and drop-off. Android's place service receives your searches; road routing receives selected endpoints. The street-map provider receives the areas you view. Requested in-app Google comparisons send selected endpoints through your firm’s authenticated routing service to Google. They are not added to your tax journal.",color=Muted,fontSize=12.sp)
        Action(if(current==null) "Use my current location" else "Update my current location",{
            val granted=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
            if(granted) locate() else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))
        },primary=false,enabled=busy==null)
        current?.let {Text("Location measured ${Instant.ofEpochMilli(it.time)}; accuracy about ${it.accuracy.roundToInt()} m.",fontSize=11.sp,color=Muted)}
    }
    for(kind in listOf("Destination","Offer pickup","Offer drop-off")) Panel(kind) {
        Field("$kind address or place",queries[kind] ?: "",{value->queries=queries+(kind to value.take(500));chosen=chosen-kind;results=null;invalidate()})
        Action("Search ${kind.lowercase()}",{
            val query=queries[kind]!!.trim();results=null;chosen=chosen-kind
            run("search:$kind") {revision->
                val matches=cache[query.lowercase()] ?: withContext(Dispatchers.IO) {
                    check(Geocoder.isPresent()) {"Place search is unavailable on this device. Check Android location services and your connection."}
                    @Suppress("DEPRECATION") val addresses=Geocoder(context,Locale.getDefault()).getFromLocationName(query,5) ?: emptyList()
                    addresses.mapNotNull {address->if(!address.hasLatitude() || !address.hasLongitude()) null else {
                        val point=PositionPoint(address.latitude,address.longitude)
                        if(!point.valid) null else SelectedRoadPlace((address.getAddressLine(0) ?: address.featureName ?: query).take(500),point)
                    }}.distinctBy {it.point}
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
        if(kind=="Destination" && showWaitingAreas && current!=null && chosen[kind]!=null)
            WaitingAreaSection(repo,current!!,chosen[kind]!!.point)
    }
    beforeCompare()
    Panel("Compare the alternatives") {
        Action("Directions in Google Maps",{
            val destination=chosen["Destination"]!!.point
            val origin=current?.let {PositionPoint(it.latitude,it.longitude)}
            val stops=if(chosen["Offer pickup"]!=null && chosen["Offer drop-off"]!=null) listOf(chosen["Offer pickup"]!!.point,chosen["Offer drop-off"]!!.point) else emptyList()
            error=openGoogleMapsDirections(context,destination,origin,stops)
        },primary=false,enabled=chosen["Destination"]!=null)
        Text("Directions opens the native Google Maps app. Review the selected stops there; it does not save an in-app comparison.",color=Muted,fontSize=12.sp)
        Action("Calculate the full route",{
            val fix=current!!;val finish=chosen["Destination"]!!;val pickup=chosen["Offer pickup"]!!;val dropoff=chosen["Offer drop-off"]!!
            run("routes") {revision->
                require(Duration.between(Instant.ofEpochMilli(fix.time),Instant.now()).seconds in 0..120) {"Update your current location before comparing routes."}
                val origin=PositionPoint(fix.latitude,fix.longitude)
                val direct=PositionRoadService.route(scope,origin,finish.point,repo.connection,repo.app);currentCoroutineContext().ensureActive()
                val toPickup=PositionRoadService.route(scope,origin,pickup.point,repo.connection,repo.app);currentCoroutineContext().ensureActive()
                val delivery=PositionRoadService.route(scope,pickup.point,dropoff.point,repo.connection,repo.app);currentCoroutineContext().ensureActive()
                val onward=PositionRoadService.route(scope,dropoff.point,finish.point,repo.connection,repo.app)
                if(version==revision && repo.scope==scope) receive(OfferRoadJourney(direct,toPickup,delivery,onward,Instant.ofEpochMilli(fix.time)))
            }
        },enabled=busy==null && current!=null && chosen.size==3)
        Text("In-app Google comparisons need your firm’s Google connection and in-app map setup. Directions in Google Maps works independently of that setup.",fontSize=11.sp,color=Muted)
        busy?.let {LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink);Text(if(it=="routes") "Checking all four road legs…" else if(it=="location") "Finding current location…" else "Searching places…",color=Muted,fontSize=12.sp)
            Action("Cancel lookup",{invalidate()},primary=false)}
        error?.let {Text(it,color=Caution,fontSize=13.sp)}
    }
}

@Composable internal fun CompleteRoadMap(repo: DriverRepository,roads: OfferRoadJourney) {
    SharedRoadMap(repo,listOf(RoadMapLine(roads.direct.points,Purple.copy(alpha=.6f),"Direct",roads.direct.providerKind),
        RoadMapLine(roads.pickup.points,Pink,"To pickup",roads.pickup.providerKind),RoadMapLine(roads.delivery.points,Pink,"Delivery",roads.delivery.providerKind),RoadMapLine(roads.onward.points,Route,"Onward",roads.onward.providerKind)),
        listOf(RoadMapMarker(roads.pickup.points.first(),androidx.compose.ui.graphics.Color.White,"Current"),RoadMapMarker(roads.pickup.points.last(),Pink,"Pickup"),
            RoadMapMarker(roads.delivery.points.last(),Pink,"Drop-off"),RoadMapMarker(roads.onward.points.last(),Route,"Destination")),
        description="Road map: direct route compared with pickup, delivery and onward travel")
    Text("Purple: direct · Pink: pickup & delivery · Light: onward",fontSize=10.sp,color=Muted)
}
