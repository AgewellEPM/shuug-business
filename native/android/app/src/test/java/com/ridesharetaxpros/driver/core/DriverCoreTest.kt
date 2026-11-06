package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import kotlinx.serialization.encodeToString

class DriverCoreTest {
    @Test fun profitRequiresKnownCostsAndKeepsCashflowSeparate() {
        val trip=DriverRecord.trip(Trip(startedAt="2026-11-05T10:00:00Z",endedAt="2026-11-05T10:30:00Z",distanceMeters=16093.44,
            classification="business",localDate="2026-11-05",earningsCents=2000,platformFeesCents=300,rideRole="ride"))
        assertNull(RideProfit(trip,Goals()).net)
        val goals=Goals(vehicleCostCentsPerMile=50.0);val priced=RideProfit(trip,goals)
        assertEquals(1200,priced.net);assertEquals(2400.0,priced.hourly!!,.001)
        val income=DriverRecord.income(Income(date="2026-11-05",description="Payout",amountCents=1700))
        val expense=DriverRecord.expense(Expense(date="2026-11-05",merchant="Fuel",amountCents=1000,category="fuel",classification="business",businessUsePercent=50))
        val personal=DriverRecord.expense(expense.expense().copy(classification="personal"))
        val days=insights(listOf(trip,income,expense,personal),goals,"2026-11-05","2026-11-05")
        assertEquals(1200L,days.single().net);assertEquals(1700L,days.single().income);assertEquals(500L,days.single().expenses)
    }
    @Test fun gpsRejectsStaleJitterAndTeleportAndMarksGaps() {
        val start=Instant.parse("2026-11-05T10:00:00Z");val tracker=TripAccumulator()
        fun fix(lat: Double,seconds: Long)=LocationFix(lat,-73.0,5.0,start.plusSeconds(seconds).toString())
        assertTrue(tracker.consume(fix(40.0,0),start));assertFalse(tracker.consume(fix(40.000001,5),start.plusSeconds(5)))
        assertTrue(tracker.consume(fix(40.001,10),start.plusSeconds(10)));val distance=tracker.distanceMeters
        assertFalse(tracker.consume(fix(41.0,15),start.plusSeconds(15)));assertEquals(distance,tracker.distanceMeters,0.0)
        assertTrue(tracker.hasGaps);assertFalse(tracker.consume(fix(40.002,20),start.plusSeconds(70)))
        assertTrue(tracker.consume(fix(40.05,130),start.plusSeconds(130)));assertEquals(distance,tracker.distanceMeters,0.0)
    }
    @Test fun importsQuotedCRLFCentsCurrencyAndStableReferences() {
        val csv="Date,Description,Amount,ID\r\n2026-11-05,\"Fuel, stop\",17.35,abc\r\n2026-11-05,Income,-25.10,def\r\n2026-11-05,Bad,12.345,ghi\r\n"
        val preview=StatementImport.previewCSV(csv,"Checking",ColumnMap(reference=3),true)
        assertEquals(2,preview.rows.size);assertEquals(1,preview.issues.size);assertEquals(1735,preview.rows[0].amountCents)
        assertEquals(-2510,preview.rows[1].amountCents);assertEquals("Fuel, stop",preview.rows[0].merchant)
        assertEquals(2,mergeBank(preview.rows,preview.rows).size)
        assertThrows(IllegalArgumentException::class.java) {StatementImport.cents("12,34")}
        assertThrows(IllegalArgumentException::class.java) {StatementImport.previewCSV(csv,"Checking",ColumnMap(),false)}
        val ofx="<OFX><CURDEF>USD<STMTTRN><DTPOSTED>20261105<TRNAMT>-17.35<FITID>abc<NAME>Fuel</STMTTRN></OFX>"
        assertEquals(1735,StatementImport.ofx(ofx,"Checking").rows.single().amountCents)
        assertEquals("UNKNOWN",StatementImport.ofx(ofx.replace("<CURDEF>USD",""),"Checking").rows.single().currency)
        assertNull(suggestCategory("T-Mobile"))
    }
    @Test fun bankCorrectionsPreserveReviewedEntriesAndJournalDeduplicates() {
        val bank=BankTransaction("file:123","statement","Checking","2026-11-05","Fuel",1735)
        val record=DriverRecord.expense(Expense(merchant="Fuel",amountCents=1735,bankReference=bank.reference))
        val journal=Journal(bankTransactions=listOf(bank)).upsert(record)
        assertEquals(record.id,journal.bankTransactions.single().reviewedRecordId)
        assertThrows(IllegalArgumentException::class.java) {journal.upsert(record.copy(id=uuid()))}
        val changed=mergeBank(journal.bankTransactions,listOf(bank.copy(amountCents=1800,removed=true))).single()
        assertTrue(changed.needsUpdateReview==true);assertEquals(record.id,changed.reviewedRecordId);assertEquals(1735,journal.visible.single().record.expense().amountCents)
    }
    @Test fun journalRetryConflictAndSerializationKeepPendingWork() {
        val record=DriverRecord.income(Income(description="Payout",amountCents=2000));val journal=Journal().upsert(record)
        val mutation=Mutation(journal.entries.single().pendingMutationId!!,record)
        val remote=ServerRecord(record.copy(revision=1),now(),1)
        assertNotNull(journal.merge(remote).entries.single().conflict)
        val edited=journal.upsert(DriverRecord.income(record.income().copy(amountCents=2300),record.id))
        val acknowledged=edited.acknowledge(mutation,remote)
        assertNotNull(acknowledged.entries.single().pendingMutationId);assertEquals(2300,acknowledged.entries.single().record.income().amountCents)
        assertEquals(1,acknowledged.entries.single().record.revision)
        assertEquals(acknowledged,Wire.decodeFromString<Journal>(Wire.encodeToString(acknowledged)))
    }
}
