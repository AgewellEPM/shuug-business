package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test

class ExpenseReviewTest {
    @Test fun personalExpensesDoNotAcquireBusinessReviewPrompts() {
        assertTrue(Expense(merchant="Lunch",amountCents=1200,category="meals",classification="personal").reviewNotes().isEmpty())
        assertEquals(listOf("Choose business or personal","Attach supporting receipt if available"),Expense(merchant="Supplies",amountCents=1200).reviewNotes())
    }
    @Test fun mealPurposeAndZeroSharePromptsRetainTheirSeparateMeanings() {
        val meal=Expense(merchant="Cafe",amountCents=2000,category="meals",classification="business",businessUsePercent=0)
        assertEquals(4,meal.reviewNotes().size)
        assertTrue(meal.reviewNotes().contains("Add meal participants or travel context"))
        assertTrue(meal.copy(receiptId="receipt",businessPurpose="Travel meeting",mealContext="Participants recorded",businessUsePercent=50).reviewNotes().isEmpty())
    }
    @Test fun periodsUseCalendarMonthAndYearRatherThanRollingDayCounts() {
        val dates=listOf("2025-12-31","2026-01-01","2026-10-31","2026-11-01","2026-11-07")
        val records=dates.map {DriverRecord.expense(Expense(date=it,merchant=it,amountCents=100))}
        assertEquals(dates.takeLast(2),expenseReviewRecords(records,"month","2026-11-07").map {it.date})
        assertEquals(dates.drop(1),expenseReviewRecords(records,"year","2026-11-07").map {it.date})
        assertEquals(5,expenseReviewRecords(records,"all","2026-11-07").size)
        assertEquals(4,expenseReviewRecords(records.dropLast(1)+records.last().copy(deleted=true),"all","2026-11-07").size)
    }
    @Test fun duplicateWarningsRequireTheSameMerchantDateCurrencyAndAmount() {
        val expense=Expense(date="2026-11-07",merchant="Café Supplies",amountCents=2500)
        val existing=DriverRecord.expense(expense)
        assertTrue(expense.copy(merchant="  CAFE SUPPLIES ").hasPossibleDuplicate(listOf(existing)))
        assertFalse(expense.copy(merchant="Different merchant").hasPossibleDuplicate(listOf(existing)))
        assertFalse(expense.copy(currency="EUR").hasPossibleDuplicate(listOf(existing)))
        assertFalse(expense.copy(date="2026-11-06").hasPossibleDuplicate(listOf(existing)))
        assertFalse(expense.hasPossibleDuplicate(listOf(existing),existing.id))
    }
}
