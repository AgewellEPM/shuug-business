package com.ridesharetaxpros.driver.core

import java.util.Locale
import java.util.concurrent.CancellationException
import org.junit.Assert.*
import org.junit.Test

class JournalExportTest {
    @Test fun exportsAllTwentyNineFlatColumnsAndExpenseEvidence() {
        val expense=Expense(date="2026-11-08",merchant="Meal, with client",category="meals",amountCents=1234,classification="business",notes="Saved \"receipt\"\nsecond line",
            receiptId="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",businessPurpose="Planning delivery work",businessUsePercent=50,mealContext="Alex · work trip",
            vehicle="Blue car",odometerMiles=101.25,paymentMethod="bank",place="Hartford",bankReference=BankReference("ref-123","statement","Checking"))
        val csv=exportCSV(listOf(DriverRecord.expense(expense,"11111111-2222-3333-4444-555555555555")))
        val rows=StatementImport.csv(csv);assertEquals(2,rows.size);assertEquals(journalCSVColumns,rows[0]);assertEquals(29,rows[1].size)
        val fields=rows[0].zip(rows[1]).toMap()
        assertEquals("12.34",fields["Amount USD"]);assertEquals("Saved \"receipt\"\nsecond line",fields["Notes"])
        assertEquals("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",fields["Receipt ID"])
        assertEquals("Meals & food",fields["Expense category"]);assertEquals("Planning delivery work",fields["Business purpose"])
        assertEquals("50",fields["Business use percent"]);assertEquals("Alex · work trip",fields["Meal context"])
        assertEquals("Blue car",fields["Vehicle"]);assertEquals("101.3",fields["Odometer miles"]);assertEquals("Bank transfer",fields["Payment method"])
        assertEquals("Hartford",fields["Place"]);assertEquals("",fields["Review notes"])
        assertEquals("statement",fields["Bank source"]);assertEquals("Checking",fields["Bank account label"]);assertEquals("ref-123",fields["Bank transaction reference"])
        assertTrue(csv.endsWith("\r\n"));assertFalse(csv.contains("details_json"))
    }
    @Test fun tripRolesGapsDetectionAndReviewNotesMatchIOSExport() {
        val trip=DriverRecord.trip(Trip(startedAt="2026-11-08T12:00:00Z",endedAt="2026-11-08T12:30:00Z",distanceMeters=1.23456*1609.344,
            classification="business",purpose="Delivery",source="gps",hasGaps=true,earningsCents=2000,platformFeesCents=150,rideRole="delivery",automaticallyDetected=true,platform="DoorDash",workArea="Downtown"))
        val expense=DriverRecord.expense(Expense(merchant="Lunch",category="meals",amountCents=1000,classification="business",businessUsePercent=0))
        val income=DriverRecord.income(Income(platform="Uber",description="Payout",amountCents=10000,bankReference=BankReference("bank-1","Plaid","Work account")))
        val rows=StatementImport.csv(exportCSV(listOf(trip,expense,income,trip.copy(id="deleted",deleted=true))))
        assertEquals(4,rows.size);assertTrue(rows.all {it.size==29})
        val drive=rows[0].zip(rows[1]).toMap()
        assertEquals("1.235",drive["Distance miles"]);assertEquals("gps",drive["Source"]);assertEquals("Review gaps",drive["Location gaps"])
        assertEquals("20.00",drive["Fare and tips USD"]);assertEquals("1.50",drive["Platform fees USD"]);assertEquals("delivery",drive["Drive role"])
        assertEquals("DoorDash",drive["Platform"]);assertEquals("Downtown",drive["Work area"]);assertEquals("Detected; review",drive["Automatic detection"])
        assertEquals(expense.expense().reviewNotes().joinToString("; "),rows[2][19]);assertTrue(rows[2][19].contains("Add meal participants"))
        assertEquals("Client entry · Uber",rows[3][9]);assertEquals("100.00",rows[3][6]);assertEquals("bank-1",rows[3][28])
    }
    @Test fun spreadsheetFormulasStayTextAndLocaleDoesNotChangeDecimalColumns() {
        val prior=Locale.getDefault();try {Locale.setDefault(Locale.GERMANY)
            val record=DriverRecord.expense(Expense(merchant="  =HYPERLINK(\"x\")",amountCents=123,notes="\t@command",businessPurpose="+calculate",place="-formula"))
            val row=StatementImport.csv(exportCSV(listOf(record)))[1]
            assertEquals("'  =HYPERLINK(\"x\")",row[3]);assertEquals("'\t@command",row[7]);assertEquals("'+calculate",row[12]);assertEquals("'-formula",row[18])
            assertEquals("1.23",row[6])
        } finally {Locale.setDefault(prior)}
    }
    @Test fun sizeAndCancellationNeverReturnPartialOrMutateTheJournal() {
        val record=DriverRecord.expense(Expense(merchant="Original",amountCents=100))
        val journal=Journal(entries=listOf(LocalEntry(record)))
        assertThrows(IllegalArgumentException::class.java) {exportCSV(journal.visible.map {it.record},100)}
        assertThrows(CancellationException::class.java) {exportCSV(journal.visible.map {it.record},checkpoint={throw CancellationException("Canceled")})}
        assertEquals("Original",journal.visible.single().record.title)
    }
}
