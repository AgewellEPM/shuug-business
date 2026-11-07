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
