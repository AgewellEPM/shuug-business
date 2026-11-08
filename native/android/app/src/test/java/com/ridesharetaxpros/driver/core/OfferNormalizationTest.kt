package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class OfferNormalizationTest {
    private val clock=Instant.parse("2026-11-08T00:00:00Z")
    private val settings=OfferReaderSettings(enabled=true,expiresAt=clock.plusSeconds(3600).toString())
    @Test fun completeIOSLabeledFixturesRetainFieldsAndMatchCashWithoutInventingCoverage() {
        data class Example(val platform: String,val pay: Int,val pickup: Int,val delivery: Int,val travel: Int,val wait: Int,val cash: Int)
        val examples=listOf(Example("DoorDash",2400,1,6,25,5,1742),Example("Uber",2800,2,7,30,4,1997),
            Example("Spark",3800,4,14,67,10,2465),Example("Instacart",400,3,10,40,10,-250))
        for(example in examples) {
            val text="""${example.platform}
Offer payout: ${example.pay/100.0}
Guaranteed pay: ${example.pay/100.0}
Currency: USD
Pickup: Example pickup
Dropoff: Example drop-off
Pickup distance: ${example.pickup} miles
Delivery distance: ${example.delivery} miles
Reposition distance: 0 miles
Travel time: ${example.travel} minutes
Pickup wait: ${example.wait} minutes
Fees: 0
Tips included
Unconfirmed tip: 0
Expires in: 50 seconds"""
            val raw=GigOfferTextReader.read(text,settings.copy(platform=example.platform),"screenShare",clock)!!
            val reviewed=ReviewedGigOffer.captured(raw)
            assertEquals("Example pickup",reviewed.pickup);assertEquals("Example drop-off",reviewed.dropoff)
            assertEquals(example.pay,reviewed.guaranteedCents);assertEquals(0,reviewed.additionalCostsCents)
            assertEquals("travelExcludingWait",reviewed.durationCoverage);assertNull(reviewed.workingMinutes)
            assertEquals(example.cash,assessReviewedOffer(reviewed,50.0,2000,15.0).cash!!.lower)
            assertEquals(clock.plusSeconds(50).toString(),reviewed.expiresAt)
            assertEquals(raw.fields,Wire.decodeFromString<ObservedGigOffer>(Wire.encodeToString(ObservedGigOffer.serializer(),raw)).fields)
        }
    }
    @Test fun fullMoneyTokensRejectPartialOCRAndConflictingLabels() {
        listOf("$19.OO","$5,000","$12.345","$10.00/mi","$20x").forEach {token->
            assertNull(token,normalizeCaptureFields("DoorDash Accept\n$token\n5 mi").payoutCents)
            assertNull(token,normalizeCaptureFields("DoorDash\nOffer payout: $token\n5 mi").payoutCents)
        }
        assertNull(normalizeCaptureFields("Offer payout: $12.00\nOffer payout: $13.00\nGuaranteed pay: $12.00").payoutCents)
        assertEquals(1234,normalizeCaptureFields("Offer payout: USD 12.34\nFees: $1.00").payoutCents)
        assertNull(normalizeCaptureFields("DoorDash Accept\n$12.00 $13.00").payoutCents)
    }
    @Test fun onlyExplicitCompleteTimeOrTravelPlusKnownWaitSupportsProfit() {
        val base="Offer payout: 20\nGuaranteed pay: 20\nTotal working miles: 4 miles\nFees: 0\n"
        val complete=GigOfferTextReader.read(base+"Total working time: 30 minutes\nPickup wait: 10 minutes",settings,"sharedText",clock)!!
        assertEquals(3600,assessReviewedOffer(ReviewedGigOffer.captured(complete),50.0,2000).hourly!!.lower)
        val notification=complete.estimate(settings,Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0),clock)!!
        assertEquals(3600,notification.hourlyCents);assertEquals(0,notification.feesCents)
        assertEquals(4.0,notification.totalMiles,0.0);assertEquals(30.0,notification.totalMinutes,0.0)
        val unknown=GigOfferTextReader.read(base+"20 minutes",settings,"sharedText",clock)!!
        assertNull(ReviewedGigOffer.captured(unknown).workingMinutes)
        assertNull(assessReviewedOffer(ReviewedGigOffer.captured(unknown),50.0,2000).cash)
        assertNull(normalizeCaptureFields("Accept $12.00\n-5 mi\n-20 min").displayedMiles)
        assertNull(normalizeCaptureFields("Accept $12.00\n-5 mi\n-20 min").displayedMinutes)
    }
    @Test fun currencyAndTipTreatmentFollowConservativeIOSPayBounds() {
        val base=ReviewedGigOffer(payoutCents=2000,totalMiles=4.0,workingMinutes=30.0,additionalCostsCents=0)
        assertNull(assessReviewedOffer(base.copy(currency="EUR"),50.0,2000).cash)
        val included=assessReviewedOffer(base.copy(tipTreatment="includedInQuote",unconfirmedTipCents=500),50.0,2000)
        assertEquals(1300,included.cash!!.lower);assertEquals(1800,included.cash!!.upper)
        val separate=assessReviewedOffer(base.copy(guaranteedCents=2000,tipTreatment="separateFromQuote",confirmedTipCents=200,unconfirmedTipCents=300),50.0,2000)
        assertEquals(2000,separate.cash!!.lower);assertEquals(2300,separate.cash!!.upper)
        assertNull(assessReviewedOffer(base.copy(tipTreatment="includedInQuote",confirmedTipCents=2000,unconfirmedTipCents=1),50.0,2000).cash)
        assertEquals("EUR",normalizeCaptureFields("Offer payout: 20\nCurrency: EUR").fields.currency)
    }
    @Test fun notificationRejectsContradictoryCapturedGuaranteesAndIncludedTips() {
        val body="Offer payout: 15\nTotal working miles: 5 miles\nTotal working time: 30 minutes\nFees: 0\n"
        val goals=Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)
        val badGuarantee=GigOfferTextReader.read(body+"Guaranteed pay: 20",settings,"sharedText",clock)!!
        val badTips=GigOfferTextReader.read(body+"Guaranteed pay: 15\nConfirmed tip: 20\nTips included",settings,"sharedText",clock)!!
        assertNull(badGuarantee.estimate(settings,goals,clock));assertNull(badTips.estimate(settings,goals,clock))
    }
    @Test fun providerIdentityPreservesExpiryAndWorkButInvalidatesChangedTerms() {
        fun capture(payout: Int,at: Instant,platform: String="DoorDash")=GigOfferTextReader.read("$platform\nOffer id: ABC_123\nOffer payout: $payout\n5 mi\nExpires in: 10 seconds",settings.copy(platform=platform),"screenShare",at)!!
        val first=capture(15,clock)
        assertEquals("ABC_123",first.fields.providerOfferId)
        val reviewed=ReviewedGigOffer.captured(first).copy(checked=true,phase="accepted",advice="consider",startedAt=clock.toString())
        val journal=Journal(observedOffers=listOf(first),offerReviews=listOf(reviewed))
        val changed=journal.ingestCapture(capture(16,clock.plusSeconds(20)))
        assertEquals(first.id,changed.observation.id);assertEquals(first.expiresAt,changed.observation.expiresAt)
        assertFalse(changed.observation.fresh(clock.plusSeconds(20)))
        val next=changed.journal.offerReviews.single()
        assertEquals(1600,next.payoutCents);assertFalse(next.checked);assertNull(next.advice)
        assertEquals("accepted",next.phase);assertEquals(reviewed.startedAt,next.startedAt)
        assertTrue(changed.journal.entries.isEmpty())
        val other=changed.journal.ingestCapture(capture(20,clock.plusSeconds(21),"Uber"))
        assertEquals(2,other.journal.observedOffers.size)
        val quick=journal.ingestCapture(capture(14,clock.plusSeconds(1)))
        assertEquals(1400,quick.observation.payoutCents);assertFalse(quick.journal.offerReviews.single().checked)
        assertNull(normalizeCaptureFields("Offer id: "+"A".repeat(81)).fields.providerOfferId)
    }
}
