package com.ridesharetaxpros.driver.core

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class OfferReadingTest {
    private val clock=Instant.parse("2026-11-06T12:00:00Z")
    private val settings=OfferReaderSettings(enabled=true,feesCents=0,waitMinutes=5.0,expiresAt=clock.plusSeconds(14400).toString())
    @Test fun readsCompleteOfferButRequiresKnownCostsAndRejectsOldSession() {
        val offer=GigOfferTextReader.read("DoorDash\nOffer payout $19.50\nPickup 2 mi\nDelivery 4 mi\nTotal time 30 min\nAccept",settings,"screenShare",clock)!!
        assertEquals(1950,offer.payoutCents);assertEquals(6.0,offer.miles!!,0.001)
        val goals=Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)
        assertEquals(1650,offer.estimate(settings,goals,clock)!!.netCents)
        assertNull(offer.estimate(settings.copy(feesCents=null),goals,clock))
        assertNull(offer.estimate(settings.copy(id=uuid()),goals,clock))
        assertFalse(offer.fresh(clock.plusSeconds(61)))
    }
    @Test fun rejectsUnrelatedOrAmbiguousScreensAndNeedsVisiblePlatformForCapture() {
        assertNull(GigOfferTextReader.read("Checking account $200 · 30 min ago",settings,"screenShare",clock))
        assertNull(GigOfferTextReader.read("DoorDash Accept\n$20.00 $5.00\n2 mi 8 mi\n10 min 30 min",settings,"screenShare",clock))
        assertNull(GigOfferTextReader.read("Accept $12.50 · 5 mi · 20 min",settings,"screenShare",clock))
        assertNotNull(GigOfferTextReader.read("New offer\nPayout: $12.50\n5 mi\n20 min",settings,"notification",clock))
    }
    @Test fun knownExpirationAndWithdrawalCannotBeRefreshedIntoAvailability() {
        val text="DoorDash\nOffer payout $19.50\n6 mi\nTotal time 30 min\nExpires in: 20 seconds\nAccept"
        val first=GigOfferTextReader.read(text,settings,"screenShare",clock)!!
        assertEquals(clock.plusSeconds(20).toString(),first.expiresAt)
        assertTrue(first.fresh(clock.plusSeconds(19)));assertFalse(first.fresh(clock.plusSeconds(20)))
        assertNull(first.estimate(settings,Goals(targetHourlyCents=2000,vehicleCostCentsPerMile=50.0),clock.plusSeconds(20)))
        val repeated=GigOfferTextReader.read(text,settings,"screenShare",clock.plusSeconds(10))!!
        val merged=mergeObservedOffer(first,repeated)
        assertEquals(first.id,merged.id);assertEquals(first.expiresAt,merged.expiresAt)
        assertFalse(merged.fresh(clock.plusSeconds(21)))
        val withdrawn=mergeObservedOffer(merged,repeated.copy(withdrawn=true))
        assertFalse(withdrawn.fresh(clock.plusSeconds(10)))
        assertTrue(mergeObservedOffer(withdrawn,repeated.copy(observedAt=clock.plusSeconds(15).toString())).withdrawn)
        val reviewed=ReviewedGigOffer.captured(first).copy(observedAt=clock.plusSeconds(30).toString(),checked=true)
        assertFalse(reviewed.fresh(clock.plusSeconds(30)))
        val overlay=Journal(observedOffers=listOf(withdrawn),offerReviews=listOf(reviewed.copy(expiresAt=null)))
        assertTrue(reviewedOffers(overlay).single().withdrawn);assertEquals(first.expiresAt,reviewedOffers(overlay).single().expiresAt)
    }
    @Test fun expirationLabelsAreNotWorkingMinutesOrUnlabeledCountdowns() {
        val text="DoorDash\nOffer payout $19.50\n6 mi\nExpires in: 2 minutes\nAccept"
        val offer=GigOfferTextReader.read(text,settings,"screenShare",clock)!!
        assertNull(offer.minutes);assertEquals(clock.plusSeconds(120).toString(),offer.expiresAt)
        assertNull(capturedOfferAvailability("Accept 20",clock).expiresAt)
        assertEquals(clock.minusSeconds(1).toString(),capturedOfferAvailability("Expires at: ${clock.minusSeconds(1)}",clock).expiresAt)
        assertTrue(capturedOfferAvailability("Offer is no longer available",clock).withdrawn)
        assertFalse(capturedOfferAvailability("Accept or cancel",clock).withdrawn)
        val old="""{"id":"old","platform":"DoorDash","source":"sharedText","observedAt":"2026-11-06T12:00:00Z","readerSession":"old","payoutCents":1000,"miles":2,"minutes":10}"""
        val decoded=Wire.decodeFromString<ObservedGigOffer>(old)
        assertNull(decoded.expiresAt);assertFalse(decoded.withdrawn)
    }
    @Test fun tripAlertsAreIdempotentAndOldEndCannotEndANewTrip() {
        val (prepared,start)=Journal().prepareTripAlert("start","guest",clock=clock)
        val began=prepared.applyTripAlert(start.id,"start","guest",clock=clock)
        val reloaded=Wire.decodeFromString(Journal.serializer(),Wire.encodeToString(Journal.serializer(),began.journal))
        assertEquals("already",reloaded.applyTripAlert(start.id,"start","guest",clock=clock).result)
        val (withEnd,end)=reloaded.prepareTripAlert("end","guest",tripId=began.recordId,clock=clock)
        val ended=withEnd.applyTripAlert(end.id,"end","guest",clock=clock.plusSeconds(30))
        val (withNext,next)=ended.journal.prepareTripAlert("start","guest",clock=clock.plusSeconds(40))
        val latest=withNext.applyTripAlert(next.id,"start","guest",clock=clock.plusSeconds(40))
        val repeated=latest.journal.applyTripAlert(end.id,"end","guest",clock=clock.plusSeconds(50))
        assertEquals(latest.recordId,repeated.journal.activeTripId)
        assertThrows(IllegalArgumentException::class.java) {prepared.applyTripAlert(start.id,"start","other",clock=clock)}
        assertThrows(IllegalArgumentException::class.java) {prepared.applyTripAlert(start.id,"start","guest",clock=clock.plusSeconds(301))}
    }
}
