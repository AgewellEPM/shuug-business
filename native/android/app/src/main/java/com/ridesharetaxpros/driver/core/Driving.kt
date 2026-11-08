package com.ridesharetaxpros.driver.core

import java.time.Duration
import java.time.Instant
import kotlin.math.*
import kotlinx.serialization.Serializable

@Serializable data class LocationFix(val latitude: Double, val longitude: Double, val accuracy: Double, val timestamp: String,
    val startsSegment: Boolean? = null) {
    fun distance(other: LocationFix): Double {
        val p = PI/180; val a = latitude*p; val b = other.latitude*p
        val h = sin((b-a)/2).pow(2) + cos(a)*cos(b)*sin((other.longitude-longitude)*p/2).pow(2)
        return 6371008.8*2*atan2(sqrt(max(0.0,h)),sqrt(max(0.0,1-h)))
    }
}
@Serializable data class TripAccumulator(var distanceMeters: Double = 0.0, var hasGaps: Boolean = false, var sampleCount: Int = 0,
    var anchor: LocationFix? = null, var lastObservedAt: String? = null) {
    fun consume(fix: LocationFix, clock: Instant = Instant.now()): Boolean {
        val time = Instant.parse(fix.timestamp)
        if (!fix.latitude.isFinite() || !fix.longitude.isFinite() || !fix.accuracy.isFinite() || abs(fix.latitude)>90 || abs(fix.longitude)>180 || fix.accuracy !in 0.0..50.0
            || Duration.between(time,clock).seconds>20 || Duration.between(clock,time).seconds>5 || lastObservedAt?.let { time <= Instant.parse(it) } == true) return false
        if (lastObservedAt?.let { Duration.between(Instant.parse(it),time).seconds>90 } == true) { hasGaps=true; anchor=null }
        val previous = anchor
        if (previous==null) { anchor=fix; lastObservedAt=fix.timestamp; sampleCount++; return true }
        val distance=previous.distance(fix); val seconds=Duration.between(Instant.parse(previous.timestamp),time).toMillis()/1000.0
        if (seconds<=0) return false
        if (distance/seconds>65) { hasGaps=true; return false }
        lastObservedAt=fix.timestamp; sampleCount++
        if (distance<max(5.0,(previous.accuracy+fix.accuracy)*0.25)) return false
        distanceMeters+=distance; anchor=fix; return true
    }
}
data class RideProfit(val record: DriverRecord, val goals: Goals) {
    private val trip=record.trip()
    val miles=trip.distanceMeters/1609.344
    val minutes=trip.endedAt?.let { max(0.0,Duration.between(Instant.parse(trip.startedAt),Instant.parse(it)).toMillis()/60000.0) } ?: 0.0
    val fare=if(trip.rideRole=="reposition") 0 else trip.earningsCents
    val fees=if(trip.rideRole=="reposition") 0 else trip.platformFeesCents
    val vehicle=if(miles==0.0 && trip.rideRole=="shopping") 0 else goals.vehicleCostCentsPerMile?.takeIf { it.isFinite() && it in 0.0..10000.0 }?.let { (it*miles).roundToInt() }
    val net=if(fare!=null && fees!=null && vehicle!=null) fare-fees-vehicle else null
    val hourly=net?.takeIf { minutes>=1 }?.let { it/(minutes/60) }
    val perMile=net?.takeIf { miles>0 }?.let { it/miles }
}
data class RecordedHourlySummary(val hourlyCents:Double?,val timedCount:Int,val timedNetCents:Long,val timedMinutes:Double)
fun recordedHourlySummary(rides:List<RideProfit>):RecordedHourlySummary {
    val timed=rides.filter {it.hourly!=null}
    val minutes=timed.sumOf {it.minutes};val net=timed.sumOf {it.net!!.toLong()}
    return RecordedHourlySummary(if(minutes>=1)net*60/minutes else null,timed.size,net,minutes)
}
data class DayTotals(val date: String, var income: Long=0, var expenses: Long=0, var fuel: Long=0, var net: Long=0, var priced: Int=0, var miles: Double=0.0)
fun insights(records: List<DriverRecord>, goals: Goals, first: String, last: String): List<DayTotals> {
    val days=sortedMapOf<String,DayTotals>()
    for(record in records.filter { !it.deleted && it.date in first..last }) {
        val day=days.getOrPut(record.date) { DayTotals(record.date) }
        when(record.kind) {
            "income" -> day.income+=record.income().amountCents
            "expense" -> record.expense().let { if(it.classification=="business") {
                val cost=(it.amountCents*(it.businessUsePercent ?: 100).coerceIn(0,100)/100.0).roundToLong()
                day.expenses+=cost; if(it.category in listOf("fuel","ev_charging")) day.fuel+=cost
            } }
            "trip" -> record.trip().let { if(it.classification=="business" && it.endedAt!=null) {
                val profit=RideProfit(record,goals); day.miles+=profit.miles
                profit.net?.let { net -> day.net+=net; day.priced++ }
            } }
        }
    }
    return days.values.toList()
}
