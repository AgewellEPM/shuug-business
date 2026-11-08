package com.ridesharetaxpros.driver.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.util.Locale
import kotlinx.coroutines.*

@Composable fun TripRouteOptionsScreen(repo: DriverRepository,tripId: String) {
    val scope=repo.scope;val coroutine=rememberCoroutineScope()
    val record=repo.journal.visible.firstOrNull {it.record.id==tripId && it.record.kind=="trip"}?.record
    if(record==null) {Text("This trip is no longer available.");return}
    val trip=record.trip()
    var review by remember(scope,tripId) {mutableStateOf<SavedRouteReview?>(null)}
    var loading by remember(scope,tripId) {mutableStateOf(false)}
    var error by remember(scope,tripId) {mutableStateOf<String?>(null)}
    var routes by remember(scope,tripId) {mutableStateOf<List<PositionRoad>>(emptyList())}
    var selected by remember(scope,tripId) {mutableIntStateOf(0)}
    var generation by remember(scope,tripId) {mutableIntStateOf(0)}
    var job by remember(scope,tripId) {mutableStateOf<Job?>(null)}
    LaunchedEffect(scope,tripId) {
        try {val value=withContext(Dispatchers.IO) {reviewSavedRoute(repo.store.route(scope,tripId))}
            if(scope==repo.scope) {review=value;error=value.warning}}
        catch(cancelled: CancellationException) {throw cancelled}
        catch(_: Exception) {error="The saved route could not be opened. Your mileage record is still available for review."}
    }
    DisposableEffect(scope,tripId) {onDispose {job?.cancel()}}
    Panel("Compare current route options") {
        Text(String.format(Locale.US,"Recorded: %.2f miles",trip.distanceMeters/1609.344),fontWeight=FontWeight.Bold)
        Text("Send the saved start and end points to the configured road service when you tap. Current routes may omit original stops and do not prove which route was best during this trip.",color=Muted,fontSize=12.sp)
        Text("The street-map provider receives the map areas you view. Saved route points stay on this phone; these lookups are not added to your journal.",color=Muted,fontSize=12.sp)
        if(BuildConfig.DEBUG) Text("Development preview: deliberate requests use the public OSRM demonstration when no approved road service is configured. It has no live traffic guarantee.",color=Muted,fontSize=11.sp)
        Action("Compare routes for these endpoints",{
            val saved=review ?: return@Action
            if(!saved.canCompare) return@Action
            job?.cancel();val request=++generation;loading=true;error=null
            job=coroutine.launch {
                try {val alternatives=PositionRoadService.alternatives(scope,saved.first!!,saved.last!!)
                    if(repo.scope==scope && request==generation) {routes=alternatives;selected=0}}
                catch(cancelled: CancellationException) {throw cancelled}
                catch(problem: Exception) {if(repo.scope==scope && request==generation) error=problem.message ?: "Route comparison is unavailable. Your recorded trip is unchanged."}
                finally {if(repo.scope==scope && request==generation) loading=false}
            }
        },enabled=!loading && review?.canCompare==true)
        if(loading) {LinearProgressIndicator(Modifier.fillMaxWidth(),color=Pink);Text("Checking route options…",color=Muted)
            Action("Cancel lookup",{generation++;job?.cancel();loading=false},primary=false)}
        error?.let {Text(it,color=Caution,fontSize=13.sp)}
        if(review!=null && review!!.first==null) Text("No saved GPS route is available for this trip on this phone.",color=Muted,fontSize=13.sp)
    }
    val chosen=routes.getOrNull(selected)
    if(chosen!=null) {
        SharedRoadMap(repo,
            review!!.segments.map {RoadMapLine(it,Purple.copy(alpha=.65f),"Recorded route")}+
                routes.mapIndexed {index,road->RoadMapLine(road.points,if(index==selected) Route else Muted.copy(alpha=.5f),road.name)},
            listOf(RoadMapMarker(chosen.points.first(),Color.White,"Saved start"),RoadMapMarker(chosen.points.last(),Pink,"Saved end")),
            description="Saved trip endpoints and current alternative driving routes")
        Text("Purple: recorded · Light: selected current route",color=Muted,fontSize=11.sp)
        Text("${chosen.provider} · Requested ${chosen.measuredAt}",color=Muted,fontSize=11.sp)
    }
    routes.forEachIndexed {index,road->Panel(road.name) {
        Text(String.format(Locale.US,"%.2f mi · about %.0f min with the available road estimate",road.meters/1609.344,road.seconds/60),fontWeight=FontWeight.SemiBold)
        routeCostDifference(trip.distanceMeters,road.meters,repo.journal.goals.vehicleCostCentsPerMile)?.let {
            Text(String.format(Locale.US,"%.2f fewer miles than recorded · about %s less estimated vehicle cost",it.fewerMiles,usd(it.lowerVehicleCents)),color=Income,fontSize=13.sp)
        }
        Text("Check traffic, tolls, access and required stops before choosing a route. The road provider may not include live traffic.",color=Muted,fontSize=12.sp)
        OutlinedButton(onClick={selected=index},Modifier.testTag("trip.route.option.$index")) {Text(if(selected==index) "Shown on map" else "Show this route")}
    }}
}
