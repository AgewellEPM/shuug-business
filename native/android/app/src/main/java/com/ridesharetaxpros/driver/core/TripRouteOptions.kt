package com.ridesharetaxpros.driver.core

import java.time.Instant
import kotlin.math.roundToInt

data class SavedRouteReview(val segments: List<List<PositionPoint>>,val warning: String?=null) {
    val first get()=segments.firstOrNull()?.firstOrNull()
    val last get()=segments.lastOrNull()?.lastOrNull()
    val canCompare get()=warning==null && segments.sumOf {it.size}>=2
}
/** Invalid samples break lines; a damaged route never becomes a continuous sketch. */
fun reviewSavedRoute(points: List<LocationFix>): SavedRouteReview {
    val segments=mutableListOf<MutableList<PositionPoint>>()
    var current: MutableList<PositionPoint>?=null;var damaged=false;var prior: Instant?=null
    for(fix in points) {
        val point=PositionPoint(fix.latitude,fix.longitude);val time=runCatching {Instant.parse(fix.timestamp)}.getOrNull()
        if(!point.valid || !fix.accuracy.isFinite() || fix.accuracy !in 0.0..10000.0 || time==null || prior?.let {time<it}==true) {
            damaged=true;current=null;continue
        }
        if(current==null || fix.startsSegment==true) {current=mutableListOf();segments+=current}
        current+=point;prior=time
    }
    return SavedRouteReview(segments,if(damaged) "Some saved route points are invalid. The route is broken at missing sections; review the recorded mileage." else null)
}
data class RouteCostDifference(val fewerMiles: Double,val lowerVehicleCents: Int)
fun routeCostDifference(recordedMeters: Double,routeMeters: Double,costCentsPerMile: Double?): RouteCostDifference? {
    val rate=costCentsPerMile ?: return null
    if(!recordedMeters.isFinite() || recordedMeters<0 || !routeMeters.isFinite() || routeMeters<0 || !rate.isFinite() || rate !in 0.0..10000.0) return null
    val saved=recordedMeters-routeMeters
    if(saved<=160.9344) return null
    val miles=saved/1609.344
    return RouteCostDifference(miles,(miles*rate).roundToInt())
}
