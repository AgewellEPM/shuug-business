package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class PositionPlannerTest {
    private val clock=Instant.parse("2026-11-07T12:00:00Z")
    private val current=PositionPoint(41.70,-72.80)
    private val destination=PositionPoint(41.762,-72.743)
    private fun job(index: Int)=HistoricalJob(current,PositionPoint(41.75,-72.75),"Example area",1500+index*100,30.0,
        clock.minusSeconds(index*3600L+1))
    @Test fun atLeastThreeRealTowardDestinationJobsAreRequired() {
        assertTrue(historicalWaitingAreas(listOf(job(0),job(1)),current,destination,clock).isEmpty())
        val result=historicalWaitingAreas(listOf(job(0),job(1),job(2)),current,destination,clock).single()
        assertEquals(3,result.matchingJobs);assertEquals(3,result.totalJobs)
        assertEquals(1600.0,result.averageNetCents,0.0);assertEquals("Example area",result.name)
    }
    @Test fun gapsInEvidenceCannotBeReplacedByCountsOrFarHistory() {
        val bad=listOf(job(0).copy(netCents=0),job(1).copy(minutes=Double.NaN),
            job(2).copy(completedAt=clock.minusSeconds(91L*24*3600)),job(3).copy(completedAt=clock.plusSeconds(60)))
        assertTrue(historicalWaitingAreas(bad,current,destination,clock).isEmpty())
        assertTrue(historicalWaitingAreas(listOf(job(0),job(1),job(2)),PositionPoint(35.0,-80.0),destination,clock).isEmpty())
        assertTrue(historicalWaitingAreas(listOf(job(0),job(1),job(2)),current,PositionPoint(Double.NaN,0.0),clock).isEmpty())
    }
    @Test fun majorityIncludesAllEligibleJobsNotOnlyMatches() {
        val toward=listOf(job(0),job(1),job(2))
        val away=(3..6).map {job(it).copy(dropoff=PositionPoint(41.60,-72.9))}
        assertTrue(historicalWaitingAreas(toward+away,current,destination,clock).isEmpty())
        assertEquals(3,historicalWaitingAreas(toward+away.take(3),current,destination,clock).single().matchingJobs)
    }
    private fun road(miles: Double,minutes: Double)=PositionRoad(miles*1609.344,minutes*60,listOf(current,destination),clock,"Test fixture")
    private val offer=ReviewedGigOffer(platform="DoorDash",observedAt=clock.toString(),payoutCents=2400,
        guaranteedCents=2400,additionalCostsCents=0,repositionMiles=0.0,checked=true)
    private val goals=Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)
    private val preference=OfferRoadPreferences(clock.plusSeconds(3600),5.0,6.0,10.0,30.0,true)
    private fun journey()=OfferRoadJourney(road(20.0,35.0),road(2.0,5.0),road(5.0,20.0),road(8.0,15.0),clock)
    @Test fun fourRoadLegsCompareCashAndDelayAgainstGoingDirectly() {
        val result=assessOfferRoad(offer,journey(),preference,goals,15.0,clock=clock)
        assertEquals("aligned",result.outcome)
        assertEquals(1742,result.financial!!.cash!!.lower)
        assertEquals(2252,result.incrementalCash!!.lower)
        assertEquals(-5.0,result.extraMiles!!,0.00001)
        assertEquals(10.0,result.extraMinutes!!.first,0.00001)
        assertEquals(16.0,result.extraMinutes!!.second,0.00001)
        assertEquals(9.0,result.deadlineBufferMinutes!!,0.00001)
    }
    @Test fun routeAdviceCannotBypassDeadlinesFreshnessOrConfirmedStops() {
        assertEquals("skip",assessOfferRoad(offer,journey(),preference.copy(deadline=clock.plusSeconds(3000)),goals,15.0,clock=clock).outcome)
        assertNull(assessOfferRoad(offer.copy(checked=false),journey(),preference,goals,15.0,clock=clock).financial)
        assertNull(assessOfferRoad(offer.copy(observedAt=clock.minusSeconds(61).toString()),journey(),preference,goals,15.0,clock=clock).financial)
        assertNull(assessOfferRoad(offer,journey().copy(originCapturedAt=clock.minusSeconds(121)),preference,goals,15.0,clock=clock).financial)
        assertNull(assessOfferRoad(offer,journey(),preference.copy(allStopsConfirmed=false),goals,15.0,clock=clock).financial)
        assertNull(assessOfferRoad(offer.copy(repositionMiles=1.0),journey(),preference,goals,15.0,clock=clock).financial)
        assertEquals("skip",assessOfferRoad(offer,journey(),preference,goals,15.0,otherActiveWork=true,clock=clock).outcome)
        assertEquals("skip",assessOfferRoad(offer.copy(phase="accepted"),journey(),preference,goals,15.0,clock=clock).outcome)
        assertEquals("skip",assessOfferRoad(offer.copy(phase="inProgress"),journey(),preference,goals,15.0,clock=clock).outcome)
        assertNull(assessOfferRoad(offer,journey(),preference.copy(preferredPlatforms=setOf("Uber")),goals,15.0,clock=clock).financial)
    }
}
