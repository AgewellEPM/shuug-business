package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class GoogleRoutesTest {
    private val clock=Instant.parse("2026-11-08T12:00:00Z")
    @Test fun googleDefaultNeverSilentlySelectsAnOSRMEndpoint() {
        assertEquals(RoadProvider.GOOGLE,parseRoutingConfiguration("{}").provider)
        assertEquals(RoadProvider.GOOGLE,parseRoutingConfiguration("""{"androidRoadRouterUrl":"https://route.example.com"}""").provider)
        val explicit=parseRoutingConfiguration("""{"androidRoutingProvider":"osrm","androidRoadRouterUrl":"https://route.example.com"}""")
        assertEquals(RoadProvider.OSRM,explicit.provider);assertEquals("https://route.example.com",explicit.osrmBase)
        for(json in listOf("""{"androidRoutingProvider":"other"}""","""{"androidRoutingProvider":"osrm","androidRoadRouterUrl":"http://route.example.com"}""",
            """{"androidRoutingProvider":"osrm","androidRoadRouterUrl":"https://user:secret@route.example.com"}"""))
            assertTrue(runCatching {parseRoutingConfiguration(json)}.isFailure)
    }
    @Test fun readinessRequiresAnExplicitBooleanFromTheGoogleDriverEndpoint() {
        assertTrue(parseGoogleRouteReadiness("""{"provider":"googleRoutes","ready":true}""").ready)
        val unavailable=parseGoogleRouteReadiness("""{"provider":"googleRoutes","ready":false,"reason":"Ask your firm to enable Google comparisons."}""")
        assertFalse(unavailable.ready);assertEquals("Ask your firm to enable Google comparisons.",unavailable.reason)
        for(json in listOf("{}","""{"provider":"osrm","ready":true}""","""{"provider":"googleRoutes","ready":"true"}"""))
            assertTrue(runCatching {parseGoogleRouteReadiness(json)}.isFailure)
    }
    @Test fun googleResponsesAreProviderTaggedFreshBoundedAndNeverParsedAsOSRM() {
        val json="""{"provider":"googleRoutes","measuredAt":"2026-11-08T12:00:00Z","routes":[{"distanceMeters":1609.344,"durationSeconds":300,"name":"Main Street","points":[{"latitude":41.7,"longitude":-72.7},{"latitude":41.8,"longitude":-72.8}]}]}"""
        val road=parseGooglePositionRoads(json,clock).single()
        assertEquals(RoadProvider.GOOGLE,road.providerKind);assertEquals(1609.344,road.meters,0.0);assertEquals("Main Street",road.name)
        assertEquals(clock,road.measuredAt)
        for(value in listOf(json.replace("googleRoutes","osrm"),json.replace("41.8","91"),json.replace("1609.344","\"1609.344\""),json.replace("300","0"),
            json.replace("2026-11-08T12:00:00Z","2026-11-08T11:54:59Z"))) assertTrue(runCatching {parseGooglePositionRoads(value,clock)}.isFailure)
    }
    @Test fun mixedProviderLegsCannotCreateACompleteRecommendation() {
        val points=listOf(PositionPoint(41.7,-72.7),PositionPoint(41.8,-72.8))
        val road=PositionRoad(1609.344,300.0,points,clock,"Fixture")
        val plan=OfferRoadJourney(road,road.copy(providerKind=RoadProvider.GOOGLE),road,road,clock)
        val offer=ReviewedGigOffer(observedAt=clock.toString(),payoutCents=2000,guaranteedCents=2000,additionalCostsCents=0,checked=true,repositionMiles=0.0)
        val preferences=OfferRoadPreferences(clock.plusSeconds(3600),0.0,0.0,10.0,30.0,true)
        val result=assessOfferRoad(offer,plan,preferences,Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0),0.0,clock=clock)
        assertEquals("needsReview",result.outcome);assertTrue(result.reason.contains("provider changed"));assertNull(result.financial)
    }
    @Test fun pointBudgetAppliesAcrossAllAlternatives() {
        val points=List(17000) {"{\"latitude\":41.7,\"longitude\":-72.7}"}.joinToString(",")
        val route="""{"distanceMeters":1609.344,"durationSeconds":300,"points":[$points]}"""
        val json="""{"provider":"googleRoutes","measuredAt":"2026-11-08T12:00:00Z","routes":[$route,$route,$route]}"""
        assertTrue(runCatching {parseGooglePositionRoads(json,clock)}.isFailure)
    }
}
