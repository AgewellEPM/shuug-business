package com.ridesharetaxpros.driver.core

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class TripEditingTest {
    private val zone=ZoneId.of("America/New_York")
    @Test fun noteOnlySavePreservesSecondsAndTheLaterFallBackOffset() {
        val begin="2026-11-01T06:10:59.123456Z";val end="2026-11-01T06:40:01Z"
        assertEquals(Instant.parse(begin),tripEditedInstant(begin,"2026-11-01","01:10",zone))
        assertEquals(Instant.parse(end),tripEditedInstant(end,"2026-11-01","01:40",zone))
    }
    @Test fun editedAmbiguousMinutePrefersTheOriginalOffset() {
        assertEquals(Instant.parse("2026-11-01T06:15:00Z"),tripEditedInstant("2026-11-01T06:10:59Z","2026-11-01","01:15",zone))
        assertEquals(Instant.parse("2026-11-01T05:15:00Z"),tripEditedInstant("2026-11-01T05:10:59Z","2026-11-01","01:15",zone))
    }
    @Test fun nonexistentSpringForwardTimeIsRejectedInsteadOfSilentlyMovingIt() {
        assertThrows(IllegalArgumentException::class.java) {tripEditedInstant(null,"2026-03-08","02:30",zone)}
        assertEquals(Instant.parse("2026-03-08T07:30:00Z"),tripEditedInstant(null,"2026-03-08","03:30",zone))
    }
}
