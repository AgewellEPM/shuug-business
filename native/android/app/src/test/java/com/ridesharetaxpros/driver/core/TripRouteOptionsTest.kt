package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class TripRouteOptionsTest {
    private val clock=Instant.parse("2026-11-08T00:00:00Z")
    private fun fix(index: Int,split: Boolean=false)=LocationFix(41.7+index*.001,-72.7,5.0,clock.plusSeconds(index.toLong()).toString(),split)
    @Test fun savedGapsAndDamagedSamplesDoNotConnect() {
        val split=reviewSavedRoute(listOf(fix(0),fix(1),fix(2,true),fix(3)))
        assertEquals(listOf(2,2),split.segments.map {it.size});assertTrue(split.canCompare)
        val damaged=reviewSavedRoute(listOf(fix(0),fix(1).copy(latitude=Double.NaN),fix(2),fix(3)))
        assertEquals(listOf(1,2),damaged.segments.map {it.size});assertNotNull(damaged.warning);assertFalse(damaged.canCompare)
        assertFalse(reviewSavedRoute(listOf(fix(0))).canCompare)
    }
    @Test fun onlyMeaningfulPositiveDistanceSavingsUseKnownValidVehicleCost() {
        val result=routeCostDifference(10*1609.344,8*1609.344,50.0)!!
        assertEquals(2.0,result.fewerMiles,.00001);assertEquals(100,result.lowerVehicleCents)
        assertNull(routeCostDifference(1000.0,950.0,50.0));assertNull(routeCostDifference(1000.0,1200.0,50.0))
        assertNull(routeCostDifference(1000.0,0.0,null));assertNull(routeCostDifference(1000.0,0.0,Double.NaN))
    }
    @Test fun actualRouteResponsePreservesAlternativesAndRejectsMissingGeometry() {
        val json="""{"code":"Ok","routes":[{"distance":2000,"duration":300,"geometry":{"coordinates":[[-72.7,41.7],[-72.6,41.8]]},"legs":[{"summary":"Main Street"}]},{"distance":2500,"duration":260,"geometry":{"coordinates":[[-72.7,41.7],[-72.5,41.9]]}}]}"""
        val roads=parsePositionRoads(json,"Recorded test fixture",clock)
        assertEquals(2,roads.size);assertEquals("Main Street",roads.first().name)
        assertEquals(2000.0,roads.first().meters,0.0);assertEquals(clock,roads.first().measuredAt)
        assertTrue(runCatching {parsePositionRoads("""{"code":"NoRoute","routes":[]}""","Fixture",clock)}.isFailure)
        assertTrue(runCatching {parsePositionRoads(json.replace("[-72.6,41.8]","[-72.6,91]"),"Fixture",clock)}.isFailure)
    }
}
