package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ParityOffersTest {
    @Test fun sampleUsesSameConservativeCentsAsIOS() {
        val examples=sampleOfferJourneys()
        val expected=mapOf("sample:Uber" to Triple(1997,3524,3525),"sample:DoorDash" to Triple(1742,3484,3484),
            "sample:Spark" to Triple(2465,1920,1921),"sample:Instacart" to Triple(-250,-300,-300))
        for((id,values) in expected) {
            val result=assessReviewedOffer(examples.first {it.offer.id==id}.offer,50.0,2000,15.0)
            assertEquals(id,values.first,result.cash!!.lower)
            assertEquals(id,values.second,result.hourly!!.lower)
            assertEquals(id,values.third,result.hourly!!.upper)
        }
        assertNull(assessReviewedOffer(examples.first {it.offer.id=="sample:DoorDashIncomplete"}.offer,50.0,2000,15.0).cash)
    }
    @Test fun practiceDoesNotDoubleCountWaitOrCosts() {
        val offer=ReviewedGigOffer(payoutCents=750,guaranteedCents=750,totalMiles=1.6,workingMinutes=20.0,
            waitMinutes=5.0,repositionMiles=0.0,additionalCostsCents=0)
        val result=assessReviewedOffer(offer,50.0,2000)
        assertEquals(80,result.vehicle!!.lower);assertEquals(670,result.profit!!.lower)
        assertEquals(2010,result.hourly!!.lower);assertEquals("meetsGoal",result.outcome)
    }
    @Test fun unknownGuaranteeProducesRangeRatherThanInventedCertainty() {
        val offer=ReviewedGigOffer(payoutCents=2000,totalMiles=10.0,workingMinutes=30.0,additionalCostsCents=0)
        val result=assessReviewedOffer(offer,50.0,2000,15.0)
        assertEquals(-500,result.cash!!.lower);assertEquals(1275,result.cash!!.upper)
        assertEquals("needsReview",result.outcome);assertTrue(result.issues.any {it.contains("guaranteed")})
        assertNull(assessReviewedOffer(offer.copy(guaranteedCents=2100),50.0,2000).cash)
        assertNull(assessReviewedOffer(offer,null,2000).cash)
    }
    @Test fun oldCaptureDoesNotBecomeCompleteReviewedWorkingTime() {
        val raw=ObservedGigOffer(platform="Uber",source="sharedScreenshot",readerSession="example",
            payoutCents=1500,miles=4.0,minutes=20.0)
        val converted=ReviewedGigOffer.captured(raw)
        assertEquals(4.0,converted.displayedMiles!!,0.0);assertEquals(20.0,converted.displayedMinutes!!,0.0)
        assertNull(converted.totalMiles);assertNull(converted.workingMinutes)
        val saved=Journal(observedOffers=listOf(raw)).saveReviewedOffer(converted.copy(totalMiles=5.0))
        assertEquals(1,reviewedOffers(saved).size)
        assertEquals(4.0,saved.observedOffers.single().miles!!,0.0)
    }
    @Test fun sampleStateStaysOutOfRealRecordsAndSurvivesRoundTripOnlyWhenExplicitlySaved() {
        val journal=Journal();sampleOfferJourneys()
        assertTrue(journal.entries.isEmpty());assertTrue(journal.offerReviews.isEmpty())
        val saved=journal.saveReviewedOffer(ReviewedGigOffer(payoutCents=1234,pickup="Example pickup"))
        val decoded=Wire.decodeFromString<Journal>(Wire.encodeToString(Journal.serializer(),saved))
        assertEquals(1234,decoded.offerReviews.single().payoutCents);assertTrue(decoded.entries.isEmpty())
    }
    @Test fun jobStatusReportsDoNotCreateFinancialRecordsOrPermitConflictingWork() {
        val first=ReviewedGigOffer(id="first");val second=ReviewedGigOffer(id="second")
        val original=Journal(offerReviews=listOf(first,second))
        val accepted=original.reportOfferWork("first","accepted")
        assertTrue(accepted.offerReviews.first {it.id=="first"}.isActiveWork())
        assertTrue(runCatching {accepted.reportOfferWork("second","accepted")}.isFailure)
        val clock=Instant.parse("2026-11-07T17:00:00Z")
        val started=accepted.reportOfferWork("first","inProgress",clock)
        assertEquals(clock.toString(),started.offerReviews.first {it.id=="first"}.startedAt)
        val completed=started.reportOfferWork("first","completed")
        assertFalse(completed.offerReviews.first {it.id=="first"}.isActiveWork())
        assertTrue(runCatching {completed.reportOfferWork("first","inProgress")}.isFailure)
        assertTrue(completed.entries.isEmpty())
        assertEquals("accepted",completed.reportOfferWork("second","accepted").offerReviews.last().phase)
    }
}
