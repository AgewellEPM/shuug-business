package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ShiftMissionTest {
    @Test fun offerIncludesPickupAndDestinationCostsAndDeadline() {
        val mission=ShiftMission(10000,"2026-11-05T18:00:00Z","Home","2026-11-05T12:00:00Z")
        val offer=Offer(3000,200,2.0,8.0,30.0,5.0,15.0,5.0,10.0,12.0,7.0)
        val result=estimateOffer(offer,mission,50.0,2400,Instant.parse("2026-11-05T17:00:00Z"))
        assertEquals(2050.0,result.netCents,.001);assertEquals(2460.0,result.hourlyCents,.001)
        assertEquals(2950L,result.minimumPayoutCents);assertEquals(350.0,result.deadMileCostCents,.001)
        assertEquals(10.0,result.deadlineMarginMinutes,.001);assertEquals(5.0,result.homeProgressMiles!!,.001)
        assertEquals(40.0,result.additionalMinutesVsDirect,.001)
        assertEquals(20.0,estimateOffer(offer.copy(directHomeMinutes=30.0),mission,50.0,2400,Instant.parse("2026-11-05T17:00:00Z")).additionalMinutesVsDirect,.001)
        assertTrue(estimateOffer(offer,mission,50.0,2400,Instant.parse("2026-11-05T17:55:00Z")).deadlineMarginMinutes<0)
        val extreme=offer.copy(drivingMinutes=10000.0,waitMinutes=10000.0,homeMinutes=10000.0)
        assertTrue(estimateOffer(extreme,mission,50.0,100_000_000).minimumPayoutCents>Int.MAX_VALUE)
        assertThrows(IllegalArgumentException::class.java) {estimateOffer(offer.copy(payoutCents=Int.MAX_VALUE),mission,50.0,2400)}
    }
    @Test fun waitHistoryUsesOnlyMatchingLocationAndPreservesCount() {
        val samples=listOf(WaitSample("Cafe",10.0),WaitSample("cafe",20.0),WaitSample("Other",60.0))
        assertEquals(15.0,averageWait(samples,"CAFE")!!.first,.001);assertEquals(2,averageWait(samples,"cafe")!!.second)
        assertNull(averageWait(samples,"Unknown"))
    }
    @Test fun importRejectsImpossibleDatesAndNormalizesBankIdentity() {
        val csv="Date,Merchant,Amount,ID\n2026-11-05,Fuel,10.00,abc\n2026-02-30,Bad,5.00,def"
        val a=StatementImport.previewCSV(csv,"Checking",ColumnMap(reference=3),true)
        val b=StatementImport.previewCSV(csv," checking ",ColumnMap(reference=3),true)
        assertEquals(1,a.rows.size);assertEquals(1,a.issues.size);assertEquals(a.rows.single().id,b.rows.single().id)
        assertTrue(a.rows.single().id.startsWith("file:"))
    }
}
