package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test

class RoadMapViewportTest {
    @Test fun mercatorRoundTripAndDatelineFitKeepRoutesTogether() {
        val original=PositionPoint(41.762,-72.743)
        val roundtrip=RoadMapProjection.coordinate(RoadMapProjection.x(original.longitude),RoadMapProjection.y(original.latitude))
        assertEquals(original.latitude,roundtrip.latitude,0.000001);assertEquals(original.longitude,roundtrip.longitude,0.000001)
        val fit=RoadMapProjection.fit(listOf(PositionPoint(10.0,179.8),PositionPoint(10.0,-179.8)),360.0,240.0)
        assertTrue(kotlin.math.abs(fit.center.longitude)>179.0);assertTrue(fit.zoom>8)
        val tiles=RoadMapProjection.visible(fit,360.0,240.0)
        assertTrue(tiles.isNotEmpty());assertTrue(tiles.size<16)
        assertTrue(tiles.all {it.x in 0 until (1 shl it.zoom) && it.y in 0 until (1 shl it.zoom)})
    }
    @Test fun viewportFetchesOnlySmallVisibleAreaAndRejectsEmptySize() {
        assertTrue(RoadMapProjection.visible(RoadMapViewport(PositionPoint(0.0,0.0),14.0),0.0,240.0).isEmpty())
        val tiles=RoadMapProjection.visible(RoadMapViewport(PositionPoint(41.7,-72.7),14.5),400.0,240.0)
        assertTrue(tiles.size in 1..9);assertEquals(tiles.size,tiles.map {it.key}.distinct().size)
        assertTrue(RoadMapProjection.fit(emptyList(),400.0,240.0).center.valid)
    }
}
