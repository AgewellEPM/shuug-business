package com.ridesharetaxpros.driver.core

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import kotlin.math.*

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
    val measuredAt: Instant=Instant.now(),val provider: String,val name: String="",val providerKind: RoadProvider=RoadProvider.OSRM)
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
    if(legs.map {it.providerKind}.distinct().size!=1) return review("The road provider changed. Calculate the complete route again before deciding.")
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
    val hourly=if(slow.hourly!=null && fast.hourly!=null) OfferMoneyBand(min(slow.hourly.lower,fast.hourly.lower),max(slow.hourly.upper,fast.hourly.upper)) else null
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
    if(otherActiveWork) return result.copy(outcome="skip",reason="Conflicts with accepted work. Simultaneous jobs are not assumed.")
    if(offer.isActiveWork() || offer.phase=="completed") return result.copy(outcome="skip",reason="This offer is already recorded as accepted or completed.")
    if(offer.phase=="canceled") return result.copy(reason="This job is already canceled in your reports. Review a current offer instead.")
    if(hourly==null) return result.copy(reason="Guaranteed pay or complete earnings evidence is unknown.")
    if(profit.lower<=0 || hourly.lower<(goals.targetHourlyCents ?: Int.MAX_VALUE) || profit.lower-extraCost<=0)
        return result.copy(outcome="skip",reason="The job does not conservatively meet your earnings target and improve cash versus going directly.")
    if(preferences.conservative && delay*2/3>max(10.0,workMinutes*.5))
        return result.copy(reason="Travel and wait uncertainty exceed the conservative setting.")
    return if(progress>=0) result.copy(outcome="aligned",reason="Meets the pay target, stays within the deadline and ends at least as close by road.")
        else result.copy(outcome="tradeoff",reason="Profitable within your limits, but the drop-off is farther from your destination.")
}
