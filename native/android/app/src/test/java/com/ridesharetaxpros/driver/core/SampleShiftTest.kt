package com.ridesharetaxpros.driver.core

import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class SampleShiftTest {
    @Test fun thirtyDayIOSFixtureIsDeterministicAndNeverEntersRealJournal() {
        val day=LocalDate.parse("2026-11-07");val zone=ZoneId.of("America/New_York")
        val records=sampleShiftRecords(day,zone)
        assertEquals(203,records.size);assertEquals(records.size,records.map {it.id}.distinct().size)
        assertEquals(163,records.count {it.kind=="trip"});assertEquals(30,records.count {it.kind=="income"})
        assertEquals(10,records.count {it.kind=="expense"})
        assertEquals(444000,records.filter {it.kind=="income"}.sumOf {it.income().amountCents})
        assertEquals(35500,records.filter {it.kind=="expense"}.sumOf {it.expense().amountCents})
        val today=records.filter {it.kind=="trip" && it.date==day.toString()}
        assertEquals(4,today.size);assertEquals("Sample repositioning",today.last().trip().purpose)
        assertEquals(0,today.last().trip().earningsCents);assertEquals("America/New_York",today.first().trip().timeZoneId)
        assertEquals(records,sampleShiftRecords(day,zone));assertTrue(Journal().entries.isEmpty())
    }
}
