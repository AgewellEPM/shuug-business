package com.ridesharetaxpros.driver.core

import java.math.BigDecimal
import java.security.MessageDigest
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class ColumnMap(val date: Int=0,val merchant: Int=1,val amount: Int=2,val debit: Int=-1,val credit: Int=-1,val reference: Int=-1,
    val dateFormat: String="yyyy-MM-dd",val positiveMeansExpense: Boolean=true)
data class ImportPreview(val rows: List<BankTransaction>,val issues: List<String>)
object StatementImport {
    fun cents(raw: String): Int {
        var value=raw.trim().replace("$","").trim()
        if(value.startsWith('(') && value.endsWith(')')) value="-"+value.drop(1).dropLast(1)
        require(value.matches(Regex("[-+]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]{1,2})?"))) { "Invalid amount" }
        return BigDecimal(value.replace(",","")).movePointRight(2).intValueExact().also { require(kotlin.math.abs(it.toLong())<=100_000_000) }
    }
    fun csv(text: String): List<List<String>> {
        require(text.toByteArray().size<=5*1024*1024) { "Statements must be 5 MB or smaller." }
        val normalized=text.removePrefix("\uFEFF").replace("\r\n","\n").replace('\r','\n')
        val delimiter=if(normalized.lineSequence().first().contains('\t')) '\t' else ','
        val rows=mutableListOf<List<String>>(); var row=mutableListOf<String>(); val field=StringBuilder(); var quoted=false; var index=0
        fun cell() { require(row.size<80); row.add(field.toString()); field.setLength(0) }
        while(index<normalized.length) {
            val ch=normalized[index++]
            if(ch=='"') { if(quoted && index<normalized.length && normalized[index]=='"') { field.append('"'); index++ } else quoted=!quoted }
            else if(!quoted && ch==delimiter) cell()
            else if(!quoted && ch=='\n') { cell(); if(row.any { it.isNotBlank() }) rows.add(row); row=mutableListOf(); require(rows.size<=20001) }
            else field.append(ch)
            require(field.length<=16000) { "A statement cell is too long." }
        }
        require(!quoted) { "A quoted CSV cell was not closed." }
        cell(); if(row.any { it.isNotBlank() }) rows.add(row)
        require(rows.isNotEmpty()) { "The statement is empty." }; return rows
    }
    fun previewCSV(text: String,account: String,map: ColumnMap,usdConfirmed: Boolean): ImportPreview {
        require(usdConfirmed) { "Confirm that this CSV is in US dollars before importing." }
        require(account.trim().isNotEmpty()); val rows=csv(text); val result=mutableListOf<BankTransaction>(); val issues=mutableListOf<String>()
        val hash=hash(text)
        rows.drop(1).forEachIndexed { index,row ->
            try {
                fun at(column: Int)=row.getOrNull(column)?.trim() ?: ""
                val date=LocalDate.parse(at(map.date),DateTimeFormatter.ofPattern(map.dateFormat.replace("yyyy","uuuu")).withResolverStyle(java.time.format.ResolverStyle.STRICT)).toString()
                val merchant=at(map.merchant).take(160); require(merchant.isNotEmpty())
                val amount=if(map.debit>=0 || map.credit>=0) {
                    val debit=at(map.debit).takeIf {it.isNotEmpty()}?.let(::cents) ?: 0
                    val credit=at(map.credit).takeIf {it.isNotEmpty()}?.let(::cents) ?: 0
                    require(debit==0 || credit==0); kotlin.math.abs(debit)-kotlin.math.abs(credit)
                }
                    else cents(at(map.amount))*(if(map.positiveMeansExpense) 1 else -1)
                require(amount!=0); val reference=at(map.reference)
                val id="file:"+hash(account.trim().lowercase(java.util.Locale.ROOT)+"|"+(if(reference.isEmpty()) "$hash|row:$index" else "reference:$reference"))
                result.add(BankTransaction(id,"statement",account.trim().take(80),date,merchant,amount,suggestedCategory=suggestCategory(merchant)))
            } catch(_: Exception) { issues.add("Row ${index+2}: check date, merchant and amount.") }
        }
        return ImportPreview(result,issues)
    }
    fun ofx(text: String,account: String): ImportPreview {
        require(text.toByteArray().size<=5*1024*1024); require(account.isNotBlank())
        fun tag(source: String,name: String)=Regex("<$name>\\s*([^<\\r\\n]*)",RegexOption.IGNORE_CASE).find(source)?.groupValues?.get(1)?.trim()
        val currency=tag(text,"CURDEF")?.uppercase() ?: "UNKNOWN"
        val result=mutableListOf<BankTransaction>(); val issues=mutableListOf<String>()
        val sections=Regex("<STMTTRN>",RegexOption.IGNORE_CASE).split(text).drop(1); require(sections.size<=20000)
        sections.forEachIndexed { index,section -> try {
            val part=section.substringBefore("</STMTTRN>").substringBefore("</BANKTRANLIST>")
            val raw=tag(part,"DTPOSTED") ?: error("Date missing"); val date=LocalDate.parse(raw.take(8),DateTimeFormatter.BASIC_ISO_DATE).toString()
            val merchant=(tag(part,"NAME") ?: tag(part,"MEMO") ?: "Bank transaction").take(160)
            val amount=-cents(tag(part,"TRNAMT") ?: ""); require(amount!=0)
            val ref=tag(part,"FITID")?.takeIf {it.isNotEmpty()} ?: error("Bank reference missing")
            result.add(BankTransaction("ofx:"+hash(account.lowercase(java.util.Locale.ROOT)+"|"+ref),"statement",account.take(80),date,merchant,amount,currency,suggestedCategory=suggestCategory(merchant)))
        } catch(_: Exception) { issues.add("Transaction ${index+1}: check date and amount.") } }
        require(sections.isNotEmpty()) { "No OFX/QFX transactions were found." }; return ImportPreview(result,issues)
    }
    private fun hash(value: String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
fun suggestCategory(merchant: String): String? = when {
    Regex("(?i)\\b(shell|exxon|mobil|chevron|gas|fuel|sunoco|bp)\\b").containsMatchIn(merchant)->"fuel"
    Regex("(?i)\\b(charging|supercharger|chargepoint)\\b").containsMatchIn(merchant)->"ev_charging"
    Regex("(?i)\\b(mcdonald|restaurant|cafe|coffee|burger|taco|pizza|wendy)").containsMatchIn(merchant)->"meals"
    Regex("(?i)\\b(autozone|repair|o'reilly|napa|dealership)\\b").containsMatchIn(merchant)->"repairs"
    Regex("(?i)\\b(tire|tires)\\b").containsMatchIn(merchant)->"tires"
    else->null
}
fun mergeBank(existing: List<BankTransaction>,incoming: List<BankTransaction>): List<BankTransaction> {
    val rows=existing.associateBy { it.id }.toMutableMap()
    incoming.forEach { fresh -> val prior=rows[fresh.id]; rows[fresh.id]=fresh.copy(reviewedRecordId=prior?.reviewedRecordId,
        ignored=prior?.ignored,needsUpdateReview=prior?.needsUpdateReview==true || (prior?.reviewedRecordId!=null &&
            (prior.amountCents!=fresh.amountCents || prior.date!=fresh.date || prior.removed!=fresh.removed || prior.currency!=fresh.currency || prior.merchant!=fresh.merchant))) }
    require(rows.size<=50000) { "Bank inbox is full. Export and review older transactions." }; return rows.values.toList()
}
