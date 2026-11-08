package com.ridesharetaxpros.driver.core

import com.ridesharetaxpros.driver.BuildConfig
import com.ridesharetaxpros.driver.data.boundedRead
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.HttpURLConnection
import java.net.URI
import java.time.Duration
import java.time.Instant
import kotlin.math.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

data class PositionPoint(val latitude: Double,val longitude: Double) {
    val valid get()=latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0
    fun meters(other: PositionPoint): Double {
        val scale=PI/180
        val a=sin((other.latitude-latitude)*scale/2).pow(2)+cos(latitude*scale)*cos(other.latitude*scale)*sin((other.longitude-longitude)*scale/2).pow(2)
        return 6371000*2*asin(sqrt(a.coerceIn(0.0,1.0)))
    }
}
data class HistoricalJob(val origin: PositionPoint,val dropoff: PositionPoint,val area: String,
    val netCents: Int,val minutes: Double,val completedAt: Instant)
data class HistoricalArea(val id: String,val name: String,val origin: PositionPoint,val dropoff: PositionPoint,
    val matchingJobs: Int,val totalJobs: Int,val averageNetCents: Double,val averageMinutes: Double) {
    val matchingShare get()=matchingJobs.toDouble()/totalJobs
}

/** Same eligibility, 500m progress, majority and three-job threshold as iOS. */
fun historicalWaitingAreas(history: List<HistoricalJob>,current: PositionPoint,destination: PositionPoint,
    clock: Instant=Instant.now()): List<HistoricalArea> {
    if(!current.valid || !destination.valid) return emptyList()
    val eligible=history.filter {it.origin.valid && it.dropoff.valid && it.netCents in 1..100_000_000 &&
        it.minutes.isFinite() && it.minutes in 1.0..1440.0 &&
        Duration.between(it.completedAt,clock).seconds in 0..90L*24*3600 && current.meters(it.origin)<=15000}
    fun grid(value: Double)=BigDecimal.valueOf(value).divide(BigDecimal("0.005"),0,RoundingMode.HALF_UP).toLong()
    return eligible.groupBy {"${grid(it.origin.latitude)}|${grid(it.origin.longitude)}"}.mapNotNull {(id,rows)->
        val matches=rows.filter {it.origin.meters(destination)-it.dropoff.meters(destination)>=500}
        if(matches.size<3 || matches.size*2<rows.size) null else {
            val first=matches.first()
            HistoricalArea(id,first.area.trim().ifBlank {"Your recorded job-start area"},first.origin,first.dropoff,
                matches.size,rows.size,matches.map {it.netCents}.average(),matches.map {it.minutes}.average())
        }
    }.sortedWith {a,b->
        if(abs(a.matchingShare-b.matchingShare)>.01) b.matchingShare.compareTo(a.matchingShare)
        else (b.averageNetCents/b.averageMinutes).compareTo(a.averageNetCents/a.averageMinutes)
    }
}

data class PositionRoad(val meters: Double,val seconds: Double,val points: List<PositionPoint>,
    val measuredAt: Instant=Instant.now(),val provider: String)
data class PositionedArea(val area: HistoricalArea,val approach: PositionRoad,val onward: PositionRoad,
    val repositionCents: Int,val hourlyCents: Int,val deadlineMarginMinutes: Double?)

data class OfferRoadJourney(val direct: PositionRoad,val pickup: PositionRoad,val delivery: PositionRoad,
    val onward: PositionRoad,val originCapturedAt: Instant)
data class OfferRoadPreferences(val deadline: Instant,val waitMinutes: Double,val delayMinutes: Double,
    val maximumExtraMiles: Double,val maximumExtraMinutes: Double,val allStopsConfirmed: Boolean,
    val conservative: Boolean=true,val preferredPlatforms: Set<String> = gigPlatforms.keys)
data class OfferRoadAssessment(val outcome: String="needsReview",val reason: String,
    val financial: ReviewedOfferAssessment?=null,val extraMiles: Double?=null,
    val extraMinutes: Pair<Double,Double>?=null,val homeProgressMiles: Double?=null,
    val latestArrival: Instant?=null,val deadlineBufferMinutes: Double?=null,val incrementalCash: OfferMoneyBand?=null)

/** Four actual road legs; caller confirms every remaining stop before advice. */
fun assessOfferRoad(offer: ReviewedGigOffer,journey: OfferRoadJourney,preferences: OfferRoadPreferences,
    goals: Goals,reservePercent: Double,otherActiveWork: Boolean=false,clock: Instant=Instant.now()): OfferRoadAssessment {
    fun review(reason: String)=OfferRoadAssessment(reason=reason)
    if(!offer.checked || !offer.fresh(clock) || offer.platform !in preferences.preferredPlatforms)
        return review("Missing current offer or platform preference. Recheck the offer in its original app and review its fields.")
    val legs=listOf(journey.direct,journey.pickup,journey.delivery,journey.onward)
    if(Duration.between(journey.originCapturedAt,clock).seconds !in 0..120 || legs.any {
        Duration.between(it.measuredAt,clock).seconds !in 0..300 || !it.meters.isFinite() || it.meters !in 0.0..16_093_440.0 ||
            !it.seconds.isFinite() || it.seconds !in 0.0..86400.0
    }) return review("Your location or road routes are old or incomplete. Update your location and compare again.")
    if(!preferences.allStopsConfirmed || (offer.repositionMiles!=null && offer.repositionMiles!=0.0))
        return review("Confirm that pickup, drop-off and home cover every remaining stop. Extra repositioning needs its own road route.")
    val wait=preferences.waitMinutes;val delay=preferences.delayMinutes
    if(!wait.isFinite() || wait !in 0.0..240.0 || !delay.isFinite() || delay !in 0.0..240.0 ||
        !preferences.maximumExtraMiles.isFinite() || preferences.maximumExtraMiles !in 0.0..10000.0 ||
        !preferences.maximumExtraMinutes.isFinite() || preferences.maximumExtraMinutes !in 0.0..1440.0)
        return review("Enter known wait, delay allowance and additional-travel limits.")
    val workMiles=(journey.pickup.meters+journey.delivery.meters)/1609.344
    val workMinutes=(journey.pickup.seconds+journey.delivery.seconds)/60+wait
    val routed=offer.copy(totalMiles=workMiles,workingMinutes=workMinutes,waitMinutes=wait,repositionMiles=0.0)
    val fast=assessReviewedOffer(routed,goals.vehicleCostCentsPerMile,goals.targetHourlyCents,reservePercent)
    val slow=assessReviewedOffer(routed.copy(workingMinutes=workMinutes+delay*2/3),goals.vehicleCostCentsPerMile,goals.targetHourlyCents,reservePercent)
    val hourly=if(slow.hourly!=null && fast.hourly!=null) OfferMoneyBand(slow.hourly.lower,fast.hourly.upper) else null
    val financial=fast.copy(hourly=hourly)
    val extraMiles=workMiles+(journey.onward.meters-journey.direct.meters)/1609.344
    val extraTime=workMinutes+(journey.onward.seconds-journey.direct.seconds)/60
    val latest=clock.plusMillis(((workMinutes+journey.onward.seconds/60+delay)*60000).roundToLong())
    val progress=(journey.direct.meters-journey.onward.meters)/1609.344
    val buffer=Duration.between(latest,preferences.deadline).toMillis()/60000.0
    var result=OfferRoadAssessment(reason="Complete reviewed cost inputs are required.",financial=financial,extraMiles=extraMiles,
        extraMinutes=extraTime to extraTime+delay,homeProgressMiles=progress,latestArrival=latest,deadlineBufferMinutes=buffer)
    if(buffer<0) return result.copy(outcome="skip",reason="The full job plus onward travel exceeds your required arrival time.")
    if(extraMiles>preferences.maximumExtraMiles || extraTime+delay>preferences.maximumExtraMinutes)
        return result.copy(outcome="skip",reason="Additional travel exceeds your entered limit.")
    val rate=goals.vehicleCostCentsPerMile ?: return result
    val profit=financial.profit ?: return result
    if(!rate.isFinite() || !reservePercent.isFinite() || reservePercent !in 0.0..100.0) return result
    fun cost(meters: Double)=BigDecimal.valueOf(meters/1609.344).multiply(BigDecimal.valueOf(rate)).setScale(0,RoundingMode.HALF_UP).intValueExact()
    val extraCost=cost(journey.onward.meters)-cost(journey.direct.meters)
    fun cash(profit: Int)=profit-BigDecimal.valueOf(max(0,profit).toLong()).multiply(BigDecimal.valueOf(reservePercent))
        .divide(BigDecimal(100)).setScale(0,RoundingMode.HALF_UP).intValueExact()
    result=result.copy(incrementalCash=OfferMoneyBand(cash(profit.lower-extraCost),cash(profit.upper-extraCost)))
    if(otherActiveWork) return result.copy(reason="You reported another active job. Review that commitment before considering overlapping work.")
    if(offer.phase in setOf("completed","canceled")) return result.copy(reason="This job is already ${offer.phase} in your reports. Review a current offer instead.")
    if(offer.guaranteedCents==null || hourly==null) return result.copy(reason="Guaranteed pay or complete earnings evidence is unknown.")
    if(profit.lower<=0 || hourly.lower<(goals.targetHourlyCents ?: Int.MAX_VALUE) || profit.lower-extraCost<=0)
        return result.copy(outcome="skip",reason="The job does not conservatively meet your earnings target and improve cash versus going directly.")
    if(preferences.conservative && delay*2/3>max(10.0,workMinutes*.5))
        return result.copy(reason="Travel and wait uncertainty exceed the conservative setting.")
    return if(progress>=0) result.copy(outcome="aligned",reason="Meets the pay target, stays within the deadline and ends at least as close by road.")
        else result.copy(outcome="tradeoff",reason="Profitable within your limits, but the drop-off is farther from your destination.")
}

/** Explicit requests only. Endpoints can be changed in the public configuration. */
object PositionRoadService {
    private val lock=Mutex()
    private var configAt=Instant.EPOCH
    private var configured: String?=null
    private val cache=linkedMapOf<String,PositionRoad>()
    const val configurationKey="androidRoadRouterUrl"
    private fun read(url: String,limit: Int): ByteArray {
        val request=URI(url).toURL().openConnection() as HttpURLConnection
        try {
            request.instanceFollowRedirects=false;request.connectTimeout=15000;request.readTimeout=20000
            request.setRequestProperty("User-Agent","GigTaxPros-Android/0.1 (+https://gigtax.pro)")
            request.setRequestProperty("Accept","application/json");request.setRequestProperty("Cache-Control","no-store")
            require(request.responseCode==200) {"Road routing is unavailable right now. Try again later."}
            return request.inputStream.use {boundedRead(it,limit)}
        } finally {request.disconnect()}
    }
    private fun validEndpoint(value: String): String {
        val uri=URI(value)
        val host=uri.host?.lowercase() ?: error("Road routing is not connected.")
        require(uri.scheme=="https" && uri.userInfo==null && uri.query==null && uri.fragment==null &&
            uri.port in listOf(-1,443) && host.contains('.') && !host.matches(Regex("[0-9.]+")) &&
            !host.endsWith(".local") && !host.endsWith(".internal") && !host.endsWith(".localhost") &&
            !uri.path.split('/').contains("..")) {"The road-routing address is unavailable."}
        return value.trimEnd('/')
    }
    private fun endpoint(): Pair<String,String> {
        if(Duration.between(configAt,Instant.now()).seconds !in 0..600) {
            configured=runCatching {
                Wire.parseToJsonElement(read("https://gigtax.pro/site-config.json",100000).toString(Charsets.UTF_8))
                    .jsonObject[configurationKey]?.jsonPrimitive?.contentOrNull?.let(::validEndpoint)
            }.getOrNull()
            configAt=Instant.now()
        }
        configured?.let {return it to "Configured road routing · OpenStreetMap"}
        check(BuildConfig.DEBUG) {"Road comparisons are not connected yet. You can still open directions in Maps."}
        return "https://router.project-osrm.org" to "Public OSRM demonstration · No live traffic"
    }
    suspend fun route(scope: String,from: PositionPoint,to: PositionPoint): PositionRoad = withContext(Dispatchers.IO) {
        require(from.valid && to.valid) {"Choose valid route endpoints."}
        lock.withLock {
            val (endpoint,provider)=endpoint()
            val key="$scope|$endpoint|${from.longitude},${from.latitude};${to.longitude},${to.latitude}"
            cache[key]?.takeIf {Duration.between(it.measuredAt,Instant.now()).seconds in 0..300}?.let {return@withLock it}
            val url="$endpoint/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=false"
            val body=Wire.parseToJsonElement(read(url,2*1024*1024).toString(Charsets.UTF_8)).jsonObject
            require(body["code"]?.jsonPrimitive?.content=="Ok") {"No supported road route was found. Choose another place."}
            val route=body["routes"]?.jsonArray?.firstOrNull()?.jsonObject ?: error("No road route was returned.")
            val distance=route["distance"]!!.jsonPrimitive.double;val seconds=route["duration"]!!.jsonPrimitive.double
            require(distance.isFinite() && distance in 0.0..20_000_000.0 && seconds.isFinite() && seconds in 0.0..864000.0)
            val coordinates=route["geometry"]!!.jsonObject["coordinates"]!!.jsonArray
            require(coordinates.size in 2..50000) {"This road route is too large to display."}
            val points=coordinates.map {it.jsonArray.let {p->PositionPoint(p[1].jsonPrimitive.double,p[0].jsonPrimitive.double)}}
            require(points.all {it.valid})
            val result=PositionRoad(distance,seconds,points,provider=provider)
            if(cache.size>=32) cache.remove(cache.keys.first())
            cache[key]=result;result
        }
    }
}
