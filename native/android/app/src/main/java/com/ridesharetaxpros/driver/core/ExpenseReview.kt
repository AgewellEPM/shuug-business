package com.ridesharetaxpros.driver.core

fun Expense.reviewNotes():List<String> {
    if(classification=="personal")return emptyList()
    return buildList {
        if(classification=="unclassified")add("Choose business or personal")
        if(receiptId==null)add("Attach supporting receipt if available")
        if(classification=="business" && businessPurpose.isNullOrBlank())add("Add the business purpose")
        if(classification=="business" && category=="meals" && mealContext.isNullOrBlank())add("Add meal participants or travel context")
        if(classification=="business" && businessUsePercent==0)add("Review the zero business-use percentage")
    }
}

fun Expense.hasPossibleDuplicate(records:List<DriverRecord>,excluding:String?=null):Boolean {
    fun merchant(value:String)=java.text.Normalizer.normalize(value.trim(),java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"").lowercase(java.util.Locale.US)
    return records.any {record->!record.deleted && record.id!=excluding && record.kind=="expense" && record.expense().let {other->
        other.date==date && other.amountCents==amountCents && other.currency==currency && merchant(other.merchant)==merchant(this.merchant)
    }}
}

fun expenseReviewRecords(records:List<DriverRecord>,period:String,currentDay:String=today()):List<DriverRecord> {
    require(period in setOf("month","year","all"))
    return records.filter {record->!record.deleted && record.kind=="expense" && when(period) {
        "month"->record.date.startsWith(currentDay.take(7))
        "year"->record.date.startsWith(currentDay.take(4))
        else->true
    }}
}
