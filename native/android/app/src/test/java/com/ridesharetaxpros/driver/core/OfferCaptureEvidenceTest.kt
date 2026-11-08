package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class OfferCaptureEvidenceTest {
    private val clock=Instant.parse("2026-11-08T00:00:00Z")
    private val offer=ReviewedGigOffer(id="example",source="sharedScreenshot",observedAt=clock.toString(),payoutCents=2400,guaranteedCents=2400,additionalCostsCents=0,checked=true,repositionMiles=0.0)
    private val goals=Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)
    private val capture=ObservedGigOffer(id=offer.id,platform=offer.platform,source=offer.source,observedAt=clock.toString(),readerSession="fixture",payoutCents=2400,miles=7.0,minutes=null)
    private fun road(miles: Double,minutes: Double)=PositionRoad(miles*1609.344,minutes*60,listOf(PositionPoint(41.7,-72.7),PositionPoint(41.8,-72.8)),clock,"Fixture")
    private val roads=OfferRoadJourney(road(20.0,35.0),road(2.0,5.0),road(5.0,20.0),road(8.0,15.0),clock)
    private val preferences=OfferRoadPreferences(clock.plusSeconds(3600),5.0,0.0,10.0,30.0,true)
    private val evidence=OfferRouteEvidence(offer,goals,15.0,roads,preferences)
    private val journal=Journal(goals=goals,taxReservePercent=15.0,offerReviews=listOf(offer),observedOffers=listOf(capture))
    @Test fun routeEvidenceMustMatchReviewedFieldsProfileAndFreshness() {
        assertTrue(offerCaptureReport(journal,"DoorDash",evidence,clock).sufficient)
        assertFalse(offerCaptureReport(journal,"DoorDash",null,clock).sufficient)
        assertFalse(offerCaptureReport(journal.copy(goals=goals.copy(vehicleCostCentsPerMile=60.0)),"DoorDash",evidence,clock).sufficient)
        assertFalse(offerCaptureReport(journal.copy(offerReviews=listOf(offer.copy(payoutCents=2500))),"DoorDash",evidence,clock).sufficient)
        assertFalse(offerCaptureReport(journal,"DoorDash",evidence,clock.plusSeconds(61)).sufficient)
        val conflicting=journal.saveReviewedOffer(offer.copy(id="other",phase="accepted"))
        assertEquals("skip",offerCaptureReport(conflicting,"DoorDash",evidence,clock).recommendation!!.outcome)
        assertTrue(offerCaptureReport(conflicting,"DoorDash",evidence,clock).sufficient)
    }
    @Test fun memoryCacheIsAccountScopedAndCannotEstablishCaptureByItself() {
        OfferRouteEvidenceCache.put("fixture-account-a",evidence)
        assertNotNull(OfferRouteEvidenceCache.get("fixture-account-a",offer.id))
        assertNull(OfferRouteEvidenceCache.get("fixture-account-b",offer.id))
        assertFalse(offerCaptureReport(journal.copy(observedOffers=emptyList()),"DoorDash",evidence,clock).sufficient)
        assertTrue(journal.entries.isEmpty())
        OfferRouteEvidenceCache.remove("fixture-account-a",offer.id)
        assertNull(OfferRouteEvidenceCache.get("fixture-account-a",offer.id))
    }
}
