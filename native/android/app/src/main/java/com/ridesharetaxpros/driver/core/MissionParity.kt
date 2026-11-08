package com.ridesharetaxpros.driver.core

import java.time.Duration
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlinx.serialization.Serializable

@Serializable data class ComparedMissionOffer(val id: String=uuid(),val label: String,val direction: String,
    val payoutCents: Int,val feesCents: Int,val miles: Double,val minutes: Double,val waitMinutes: Double,val homeMinutes: Double?)
data class ActiveHourOfferEstimate(val netCents: Int,val minimumCents: Int,val hourlyCents: Double,
    val meetsGoal: Boolean,val deadlineMinutesRemaining: Double?)

/** Current iOS Go Home semantics: onward travel affects arrival, not active hourly. */
fun ComparedMissionOffer.activeHourEstimate(goals: Goals,deadline: String?,clock: Instant=Instant.now()): ActiveHourOfferEstimate? {
    val rate=goals.vehicleCostCentsPerMile ?: return null
    val target=goals.targetHourlyCents ?: return null
    if(payoutCents !in 0..100_000_000 || feesCents !in 0..100_000_000 || !miles.isFinite() || miles !in 0.0..10000.0 ||
        !minutes.isFinite() || minutes !in 1.0..1440.0 || !waitMinutes.isFinite() || waitMinutes !in 0.0..240.0 ||
        !rate.isFinite() || rate !in 0.0..10000.0 || target !in 1..1_000_000 ||
        (homeMinutes!=null && (!homeMinutes.isFinite() || homeMinutes !in 0.0..1440.0))) return null
    val cost=(miles*rate).roundToInt();val total=minutes+waitMinutes
    val net=payoutCents-feesCents-cost
    val minimum=ceil(target*total/60).toInt()+feesCents+cost
    val onward=homeMinutes
    val buffer=if(deadline!=null && onward!=null) runCatching {
        Duration.between(clock,Instant.parse(deadline)).toMillis()/60000.0-total-onward
    }.getOrNull() else null
    return ActiveHourOfferEstimate(net,minimum,net*60/total,payoutCents>=minimum,buffer)
}
