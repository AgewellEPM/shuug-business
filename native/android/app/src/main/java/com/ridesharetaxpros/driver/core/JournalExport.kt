package com.ridesharetaxpros.driver.core

import java.util.Locale

val journalCSVColumns=listOf("Record ID","Type","Date","Description","Classification","Distance miles","Amount USD","Notes",
    "Receipt ID","Source","Location gaps","Expense category","Business purpose","Business use percent","Meal context","Vehicle",
    "Odometer miles","Payment method","Place","Review notes","Fare and tips USD","Platform fees USD","Drive role","Platform","Work area",
    "Automatic detection","Bank source","Bank account label","Bank transaction reference")

private fun csvIdentity(value: String)=if(value.matches(Regex("[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}"))) value.lowercase(Locale.ROOT) else value
private fun csvField(value: String): String {
    val trimmed=value.trimStart {it.isWhitespace() || it=='\uFEFF' || it=='\u200B'}
    val safe=if(trimmed.firstOrNull() in setOf('=','+','-','@')) "'$value" else value
    return "\""+safe.replace("\"","\"\"")+"\""
}
private fun usdValue(cents: Int)=String.format(Locale.US,"%.2f",cents/100.0)

/** Same 29 flat columns as the iOS journal export; no raw private JSON is appended. */
fun exportCSV(journal: Journal): String=exportCSV(journal.visible.map {it.record})
fun exportCSV(records: List<DriverRecord>,maxBytes: Int=Int.MAX_VALUE,checkpoint: ()->Unit={}): String {
    require(maxBytes>0) {"Choose a positive CSV size limit."}
    val output=StringBuilder();var bytes=0L
    fun append(row: List<String>) {
        checkpoint();require(row.size==journalCSVColumns.size)
        val line=row.joinToString(",",transform=::csvField)+"\r\n"
        bytes+=line.toByteArray(Charsets.UTF_8).size
        require(bytes<=maxBytes) {"This journal CSV exceeds the ${maxBytes/(1024*1024)} MB export limit. Your original records are kept."}
        output.append(line)
    }
    append(journalCSVColumns)
    for(record in records) {
        checkpoint();if(record.deleted) continue
        val row=MutableList(29) {""}
        row[0]=csvIdentity(record.id);row[1]=record.kind;row[2]=record.date;row[3]=record.title
        when(record.kind) {
            "trip"->record.trip().let {trip->
                row[4]=trip.classification;row[5]=String.format(Locale.US,"%.3f",trip.distanceMeters/1609.344)
                row[7]=trip.notes;row[9]=trip.source;row[10]=if(trip.hasGaps) "Review gaps" else ""
                row[20]=trip.earningsCents?.let(::usdValue) ?: "";row[21]=trip.platformFeesCents?.let(::usdValue) ?: ""
                row[22]=trip.rideRole ?: "";row[23]=trip.platform ?: "";row[24]=trip.workArea ?: ""
                row[25]=if(trip.automaticallyDetected==true) "Detected; review" else ""
            }
            "expense"->record.expense().let {expense->
                row[4]=expense.classification;row[6]=usdValue(expense.amountCents);row[7]=expense.notes
                row[8]=expense.receiptId?.let(::csvIdentity) ?: "";row[9]="Client entry"
                row[11]=expenseCategories[expense.category] ?: expense.category;row[12]=expense.businessPurpose ?: ""
                row[13]=expense.businessUsePercent?.toString() ?: "";row[14]=expense.mealContext ?: "";row[15]=expense.vehicle ?: ""
                row[16]=expense.odometerMiles?.let {String.format(Locale.US,"%.1f",it)} ?: ""
                row[17]=expense.paymentMethod?.let {when(it) {"cash"->"Cash";"card"->"Card";"bank"->"Bank transfer";"platform"->"Deducted from payout";"other"->"Other";else->it}} ?: ""
                row[18]=expense.place ?: "";row[19]=expense.reviewNotes().joinToString("; ")
            }
            "income"->record.income().let {income->row[6]=usdValue(income.amountCents);row[7]=income.notes;row[9]="Client entry · ${income.platform}"}
            else->error("This journal contains an unsupported record type. Your original records are kept.")
        }
        record.bankReference?.let {reference->row[26]=reference.provider;row[27]=reference.accountLabel;row[28]=reference.transactionId}
        append(row)
    }
    return output.toString()
}
