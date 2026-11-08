package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class MissionParityTest {
    private val goals=Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)
    private val clock=Instant.parse("2026-11-07T17:00:00Z")
    private val offer=ComparedMissionOffer(label="Uber",direction="Toward",payoutCents=3000,feesCents=100,
        miles=10.0,minutes=25.0,waitMinutes=5.0,homeMinutes=20.0)
    @Test fun onwardTimeAffectsArrivalWithoutDilutingActiveHourly() {
        val result=offer.activeHourEstimate(goals,"2026-11-07T18:00:00Z",clock)!!
        assertEquals(2400,result.netCents);assertEquals(1600,result.minimumCents)
        assertEquals(4800.0,result.hourlyCents,0.0);assertTrue(result.meetsGoal)
        assertEquals(10.0,result.deadlineMinutesRemaining!!,0.0)
        val longer=offer.copy(homeMinutes=40.0).activeHourEstimate(goals,"2026-11-07T18:00:00Z",clock)!!
        assertEquals(result.hourlyCents,longer.hourlyCents,0.0)
        assertEquals(-10.0,longer.deadlineMinutesRemaining!!,0.0)
    }
    @Test fun missingAndInvalidInputsRemainUnknown() {
        assertNull(offer.activeHourEstimate(goals.copy(vehicleCostCentsPerMile=null),null))
        assertNull(offer.activeHourEstimate(goals.copy(targetHourlyCents=null),null))
        assertNull(offer.copy(minutes=0.0).activeHourEstimate(goals,null))
        assertNull(offer.copy(miles=Double.NaN).activeHourEstimate(goals,null))
        assertNull(offer.copy(waitMinutes=241.0).activeHourEstimate(goals,null))
        assertNull(offer.copy(homeMinutes=null).activeHourEstimate(goals,"2026-11-07T18:00:00Z",clock)!!.deadlineMinutesRemaining)
        assertNull(offer.activeHourEstimate(goals,"bad date",clock)!!.deadlineMinutesRemaining)
    }
    @Test fun missionComparisonIsProtectedJournalStateWithoutEarnings() {
        val journal=Journal(missionOffers=listOf(offer))
        val copy=Wire.decodeFromString<Journal>(Wire.encodeToString(Journal.serializer(),journal))
        assertEquals(offer,copy.missionOffers.single());assertTrue(copy.entries.isEmpty())
    }
    @Test fun simpleRoadDeadlineNeedsConfirmedStopsKnownWaitAndFreshOrigin() {
        fun road(meters: Double,seconds: Double)=PositionRoad(meters,seconds,listOf(PositionPoint(41.0,-72.0),PositionPoint(41.1,-72.1)),clock,"Fixture")
        val roads=OfferRoadJourney(road(20000.0,1800.0),road(2000.0,300.0),road(8000.0,900.0),road(15000.0,900.0),clock)
        val result=missionRoadComparison(roads,5.0,true,"2026-11-07T18:00:00Z",clock)!!
        assertEquals(5000.0,result.distanceChangeMeters,0.0);assertEquals(300.0,result.extraTravelSeconds,0.0)
        assertEquals(1200.0,result.deadlineBufferSeconds!!,0.0)
        assertNull(missionRoadComparison(roads,null,true,"2026-11-07T18:00:00Z",clock)!!.deadlineBufferSeconds)
        assertNull(missionRoadComparison(roads,0.0,false,"2026-11-07T18:00:00Z",clock)!!.deadlineBufferSeconds)
        assertTrue(missionRoadComparison(roads,5.0,true,"2026-11-07T18:00:00Z",clock.plusSeconds(121))!!.stale)
    }
}
