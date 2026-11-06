package com.ridesharetaxpros.driver.core

import java.time.Duration
import java.time.Instant
import kotlin.math.ceil
import kotlinx.serialization.Serializable

@Serializable data class ShiftMission(val targetCents: Int, val deadline: String, val destination: String, val startedAt: String = now())
@Serializable data class WaitSample(val location: String, val minutes: Double, val recordedAt: String = now())
data class Offer(val payoutCents: Int, val feesCents: Int, val pickupMiles: Double, val jobMiles: Double,
    val drivingMinutes: Double, val waitMinutes: Double, val homeMinutes: Double, val homeMiles: Double, val directHomeMinutes: Double,
    val distanceToHomeNow: Double?, val distanceToHomeAfter: Double?)
data class OfferEstimate(val netCents: Double, val hourlyCents: Double, val minimumPayoutCents: Long,
    val deadMileCostCents: Double, val deadlineMarginMinutes: Double, val homeProgressMiles: Double?,
    val additionalMinutesVsDirect: Double)

fun estimateOffer(offer: Offer, mission: ShiftMission, costPerMile: Double, hourlyTarget: Int, clock: Instant = Instant.now()): OfferEstimate {
    require(mission.targetCents in 1..100_000_000 && offer.payoutCents in 0..100_000_000 &&
        offer.feesCents in 0..100_000_000 && hourlyTarget in 0..100_000_000) { "Enter amounts from $0 to $1,000,000." }
    val numbers = listOf(offer.pickupMiles,offer.jobMiles,offer.drivingMinutes,offer.waitMinutes,offer.homeMinutes,offer.homeMiles,offer.directHomeMinutes,costPerMile)
    require(numbers.all { it.isFinite() && it in 0.0..10000.0 }) { "Enter valid nonnegative estimates." }
    require(offer.drivingMinutes + offer.waitMinutes > 0) { "Enter a job duration greater than zero." }
    require(listOfNotNull(offer.distanceToHomeNow,offer.distanceToHomeAfter).all { it.isFinite() && it in 0.0..10000.0 })
    val cost=(offer.pickupMiles+offer.jobMiles+offer.homeMiles)*costPerMile
    val net=offer.payoutCents-offer.feesCents-cost
    val minutes=offer.drivingMinutes+offer.waitMinutes+offer.homeMinutes
    val available=Duration.between(clock,Instant.parse(mission.deadline)).seconds/60.0
    val progress=if(offer.distanceToHomeNow!=null && offer.distanceToHomeAfter!=null) offer.distanceToHomeNow-offer.distanceToHomeAfter else null
    return OfferEstimate(net,net*60/minutes,ceil(offer.feesCents+cost+hourlyTarget*minutes/60).toLong(),
        (offer.pickupMiles+offer.homeMiles)*costPerMile,available-minutes,progress,minutes-offer.directHomeMinutes)
}

fun averageWait(samples: List<WaitSample>, location: String): Pair<Double,Int>? {
    val rows=samples.filter { it.location.trim().equals(location.trim(),true) && it.minutes.isFinite() && it.minutes in 0.0..240.0 }
    return if(rows.isEmpty()) null else rows.map {it.minutes}.average() to rows.size
}
