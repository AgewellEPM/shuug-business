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
    var busy by remember(scope) {mutableStateOf(false)}
    var error by remember(scope) {mutableStateOf<String?>(null)}
    var generation by remember(scope) {mutableIntStateOf(0)}
    var job by remember(scope) {mutableStateOf<Job?>(null)}
    val geocoderCache=remember(scope) {linkedMapOf<String,List<DestinationPlace>>()}
    fun invalidate() {generation++;job?.cancel();busy=false;error=null}
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
        Text("Android's place search receives your search terms. Road routing receives selected route endpoints, including historical job starts/drop-offs needed for comparisons. The street-map provider receives the map areas you view. These lookups are not saved to your journal or sent to your firm.",fontSize=12.sp,color=Muted)
        Action(if(current==null) "Use my current location" else "Update my current location",{
            val granted=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
            if(granted) locate() else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))
        },primary=false,enabled=!busy)
        current?.let {Text("Location measured ${Instant.ofEpochMilli(it.time)}; accuracy about ${it.accuracy.roundToInt()} m.",fontSize=11.sp,color=Muted)}
        Field("Destination address or place",query,{query=it.take(500);destination=null;places=emptyList();invalidate()})
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
    if(current!=null && destination!=null) WaitingAreaSection(repo,current!!,destination!!.point)
    if(busy) {LinearProgressIndicator(modifier=Modifier.fillMaxWidth(),color=Pink);Action("Cancel lookup",{invalidate()},primary=false)}
    error?.let {Text(it,color=Caution,fontSize=13.sp)}

}

@Suppress("DEPRECATION")
internal suspend fun recentPosition(manager: LocationManager): Location = try {withTimeout(20000) {
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
}} catch(problem: TimeoutCancellationException) {
    throw IllegalStateException("Could not find a recent, accurate location. Allow precise location for Gig Tax Pros in Android Settings, then try again outdoors.",problem)
} catch(problem: SecurityException) {
    throw IllegalStateException("Location access is off. Allow location while using Gig Tax Pros in Android Settings, then try again.",problem)
}
