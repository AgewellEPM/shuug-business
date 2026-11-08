package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test

class TourCaptionsTest {
    @Test fun captionsFollowSeekPositionAndExcludeCueEnd() {
        val cues=parseTourCaptions("1\r\n00:00:00,200 --> 00:00:06,133\r\nTurn your phone sideways.\r\n\r\n2\r\n00:00:06,433 --> 00:00:09,633\r\nChoose Trips.\r\n".toByteArray())
        assertNull(cues.atPosition(199));assertEquals("Turn your phone sideways.",cues.atPosition(200))
        assertNull(cues.atPosition(6133));assertEquals("Choose Trips.",cues.atPosition(9000))
        assertEquals("Turn your phone sideways.",cues.atPosition(500));assertNull(cues.atPosition(10000))
    }
    @Test fun emptyAndInvalidIntervalsDoNotCoverTheVideo() {
        val cues=parseTourCaptions("1\n00:00:05,000 --> 00:00:04,000\nInvalid.\n\n2\n00:01:01,250 --> 00:01:03,000\nFirst line.\nSecond line.\n".toByteArray())
        assertEquals(1,cues.size);assertEquals("First line.\nSecond line.",cues.atPosition(61250))
    }
}
