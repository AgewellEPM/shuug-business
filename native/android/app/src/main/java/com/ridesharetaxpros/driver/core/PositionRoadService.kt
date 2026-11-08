package com.ridesharetaxpros.driver.core

import android.content.Context
import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.data.Connection
import com.ridesharetaxpros.driver.data.boundedRead
import com.ridesharetaxpros.driver.data.googleMapUnavailableReason
import java.net.HttpURLConnection
import java.net.URI
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*

enum class RoadProvider { LOCAL, OSRM, GOOGLE }
data class RoutingConfiguration(val provider: RoadProvider=RoadProvider.GOOGLE,val osrmBase: String?=null)
internal fun parseRoutingConfiguration(json: String): RoutingConfiguration {
    val config=Wire.parseToJsonElement(json).jsonObject
    val selected=config["androidRoutingProvider"]?.jsonPrimitive?.contentOrNull ?: "google"
    require(selected in setOf("google","osrm")) {"Your firm's maps configuration needs attention. Directions in Google Maps is still available."}
    val provider=if(selected=="osrm") RoadProvider.OSRM else RoadProvider.GOOGLE
    val base=if(provider==RoadProvider.OSRM) config["androidRoadRouterUrl"]?.jsonPrimitive?.contentOrNull?.let(::validatedRoadEndpoint) else null
    return RoutingConfiguration(provider,base)
}
private fun validatedRoadEndpoint(value: String): String {
    val uri=URI(value);val host=uri.host?.lowercase() ?: error("The road-routing address is unavailable.")
    require(uri.scheme=="https" && uri.userInfo==null && uri.query==null && uri.fragment==null && uri.port in listOf(-1,443) &&
        host.contains('.') && !host.matches(Regex("[0-9.]+")) && !host.contains(':') && !host.endsWith(".local") &&
        !host.endsWith(".internal") && !host.endsWith(".localhost") && !uri.path.split('/').contains("..")) {"The road-routing address is unavailable."}
    return value.trimEnd('/')
}

/** Google is the explicit default; unavailable setup never silently selects an OSRM demo. */
object PositionRoadService {
    private val configurationLock=Mutex();private val osrmLock=Mutex()
    private var configAt=Instant.EPOCH;private var configuration=RoutingConfiguration()
    private val osrmCache=linkedMapOf<String,List<PositionRoad>>()
    const val configurationKey="androidRoadRouterUrl"
    const val providerConfigurationKey="androidRoutingProvider"
    private fun read(url: String,limit: Int): ByteArray {
        val request=URI(url).toURL().openConnection() as HttpURLConnection
        try {
            request.instanceFollowRedirects=false;request.connectTimeout=15000;request.readTimeout=20000
            request.setRequestProperty("User-Agent","GigTaxPros-Android/0.1 (+https://gigtax.pro)")
            request.setRequestProperty("Accept","application/json");request.setRequestProperty("Cache-Control","no-store")
            require(request.responseCode==200) {"Road routing is unavailable right now. Directions in Google Maps is still available."}
            return request.inputStream.use {boundedRead(it,limit)}
        } finally {request.disconnect()}
    }
    suspend fun selectedProvider(): RoadProvider=config().provider
    private suspend fun config(): RoutingConfiguration=withContext(Dispatchers.IO) {configurationLock.withLock {
        if(Duration.between(configAt,Instant.now()).seconds !in 0..600) {
            val bytes=runCatching {read("https://gigtax.pro/site-config.json",100000)}.getOrNull()
            currentCoroutineContext().ensureActive()
            if(bytes!=null) configuration=parseRoutingConfiguration(bytes.toString(Charsets.UTF_8))
            configAt=Instant.now()
        }
        configuration
    }}
    suspend fun route(scope: String,from: PositionPoint,to: PositionPoint,connection: Connection?=null,context: Context?=null): PositionRoad =
        request(scope,from,to,false,connection,context).first()
    suspend fun alternatives(scope: String,from: PositionPoint,to: PositionPoint,connection: Connection?=null,context: Context?=null): List<PositionRoad> =
        request(scope,from,to,true,connection,context).sortedBy {it.meters}
    private suspend fun request(scope: String,from: PositionPoint,to: PositionPoint,alternatives: Boolean,connection: Connection?,context: Context?): List<PositionRoad> {
        require(from.valid && to.valid) {"Choose valid route endpoints."}
        val config=config();currentCoroutineContext().ensureActive()
        if(config.provider==RoadProvider.GOOGLE) {
            val app=context ?: error("In-app Google Maps needs setup. Directions in Google Maps is still available.")
            googleMapUnavailableReason(app)?.let {error(it)}
            currentCoroutineContext().ensureActive()
            // Google responses are held only in active UI state; the OSRM cache is never used.
            return GoogleDriverRoutes.request(scope,from,to,alternatives,connection)
        }
        return withContext(Dispatchers.IO) {osrmLock.withLock {
            val endpoint=config.osrmBase ?: if(BuildConfig.DEBUG) "https://router.project-osrm.org" else error("Your selected road service is not connected. Directions in Google Maps is still available.")
            val provider=if(config.osrmBase==null) "Public OSRM demonstration · No live traffic" else "Configured OSRM road routing · OpenStreetMap"
            val key="$scope|$endpoint|$alternatives|${from.longitude},${from.latitude};${to.longitude},${to.latitude}"
            osrmCache[key]?.takeIf {Duration.between(it.first().measuredAt,Instant.now()).seconds in 0..300}?.let {return@withLock it}
            currentCoroutineContext().ensureActive()
            val url="$endpoint/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=false&alternatives=$alternatives"
            val result=parsePositionRoads(read(url,4*1024*1024).toString(Charsets.UTF_8),provider)
            currentCoroutineContext().ensureActive()
            if(osrmCache.size>=32) osrmCache.remove(osrmCache.keys.first())
            osrmCache[key]=result;result
        }}
    }
}

internal fun parsePositionRoads(json: String,provider: String,clock: Instant=Instant.now()): List<PositionRoad> {
    val body=Wire.parseToJsonElement(json).jsonObject
    require(body["code"]?.jsonPrimitive?.content=="Ok") {"No supported road route was found. Choose another place."}
    val routes=body["routes"]?.jsonArray?.take(3).orEmpty()
    require(routes.isNotEmpty()) {"No driving routes are available for these endpoints."}
    return routes.mapIndexed {index,routeElement->
        val route=routeElement.jsonObject
        val distance=route["distance"]!!.jsonPrimitive.double;val seconds=route["duration"]!!.jsonPrimitive.double
        require(distance.isFinite() && distance in 0.0..20_000_000.0 && seconds.isFinite() && seconds in 0.0..864000.0) {"Road estimates are incomplete."}
        val coordinates=route["geometry"]!!.jsonObject["coordinates"]!!.jsonArray
        require(coordinates.size in 2..50000) {"This road route is too large to display."}
        val points=coordinates.map {it.jsonArray.let {p->PositionPoint(p[1].jsonPrimitive.double,p[0].jsonPrimitive.double)}}
        require(points.all {it.valid}) {"The returned road coordinates are incomplete."}
        val summary=route["legs"]?.jsonArray.orEmpty().mapNotNull {it.jsonObject["summary"]?.jsonPrimitive?.contentOrNull}
            .filter {it.isNotBlank()}.joinToString(" · ").take(180)
        PositionRoad(distance,seconds,points,clock,provider,summary.ifBlank {"Route option ${index+1}"})
    }.distinctBy {Triple(it.meters,it.seconds,it.points)}
}
