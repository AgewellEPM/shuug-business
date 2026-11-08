package com.ridesharetaxpros.driver.core

import kotlinx.serialization.Serializable

/** Values explicitly printed in the capture, separate from driver corrections. */
@Serializable data class CapturedOfferFields(
    val currency: String?="USD",val guaranteedCents: Int?=null,val additionalCostsCents: Int?=null,
    val pickup: String?=null,val dropoff: String?=null,val pickupMiles: Double?=null,val deliveryMiles: Double?=null,
    val repositionMiles: Double?=null,val completeMiles: Double?=null,val completeMinutes: Double?=null,
    val travelMinutes: Double?=null,val waitMinutes: Double?=null,val confirmedTipCents: Int?=null,
    val unconfirmedTipCents: Int?=null,val tipTreatment: String="unknown",val durationCoverage: String="unknown",val providerOfferId: String?=null)
data class NormalizedCaptureFields(val payoutCents: Int?,val displayedMiles: Double?,val displayedMinutes: Double?,
    val fields: CapturedOfferFields,val hasExplicitOfferLabel: Boolean)

/** Same anchored, full-token USD grammar as iOS OfferIngestion; ambiguity remains unknown. */
fun normalizeCaptureFields(text: String): NormalizedCaptureFields {
    val input=text.replace('\u00a0',' ');val lower=input.lowercase()
    fun unique(pattern: String): String?=Regex(pattern,setOf(RegexOption.IGNORE_CASE,RegexOption.MULTILINE)).findAll(input)
        .map {it.groupValues[1].trim()}.distinct().singleOrNull()
    fun hasLabel(label: String)=Regex("^[ \\t]*(?:$label)[ \\t]*[:=]?",setOf(RegexOption.IGNORE_CASE,RegexOption.MULTILINE)).containsMatchIn(input)
    fun money(label: String): Int? {
        val value=unique("^[ \\t]*(?:$label)[ \\t]*[:=]?[ \\t]*(?:\\$|USD[ \\t]*)?([0-9]{1,6}(?:\\.[0-9]{1,2})?)(?![\\w.,/])[ \\t]*$") ?: return null
        return runCatching {StatementImport.cents(value)}.getOrNull()?.takeIf {it in 0..100_000_000}
    }
    fun number(label: String,units: String,max: Double)=unique("\\b(?:$label)\\s*[:=]?\\s*([0-9]{1,4}(?:\\.[0-9]{1,3})?)\\s*(?:$units)\\b")
        ?.toDoubleOrNull()?.takeIf {it.isFinite() && it in 0.0..max}
    val payoutLabels="offer payout|quoted payout|payout"
    val labeledPayout=money(payoutLabels);val guaranteed=money("guaranteed pay|guaranteed payout")
    // A dollar token must be readable in full: $19.OO, $5,000 and $12.345 stay unknown.
    val dollarTokens=Regex("\\$\\s*([^\\s]+)").findAll(input).map {it.groupValues[1]}.toList()
    val tokenGrammar=Regex("^[0-9]{1,6}(?:\\.[0-9]{1,2})?$")
    val legacy=if(dollarTokens.isNotEmpty() && dollarTokens.all {tokenGrammar.matches(it)})
        dollarTokens.mapNotNull {runCatching {StatementImport.cents(it)}.getOrNull()}.distinct().singleOrNull()?.takeIf {it in 0..100_000_000} else null
    val payout=if(hasLabel(payoutLabels)) labeledPayout else legacy ?: guaranteed
    val explicitCurrency=unique("^currency\\s*:\\s*([A-Z]{3})[ \\t]*$")?.uppercase()
    val currency=if(hasLabel("currency")) explicitCurrency else "USD"
    fun location(pattern: String)=unique(pattern)?.takeIf {it.length in 3..240}
    val pickup=location("^pickup(?: location| address)?\\s*:\\s*([^\\n]{3,240})$")
    val dropoff=location("^(?:drop-off|dropoff|delivery address)(?: location| address)?\\s*:\\s*([^\\n]{3,240})$")
    val pickupMiles=number("pickup distance|pickup miles|to pickup|pickup|pick-up","mi|miles",10000.0)
    val deliveryMiles=number("delivery distance|delivery miles|job distance|delivery|drop-off|dropoff","mi|miles",10000.0)
    val reposition=number("reposition distance|reposition miles|unpaid return","mi|miles",10000.0)
    val allMiles=Regex("(?<![\\w.\\-/])([0-9]{1,4}(?:\\.[0-9]{1,3})?)\\s*(?:mi|miles)\\b",RegexOption.IGNORE_CASE)
        .findAll(input).mapNotNull {it.groupValues[1].toDoubleOrNull()?.takeIf {value->value in 0.0..10000.0}}.toList()
    val displayedMiles=number("total|total distance","mi|miles",10000.0)
        ?: if(pickupMiles!=null && deliveryMiles!=null) (pickupMiles+deliveryMiles).takeIf {it<=10000} else allMiles.singleOrNull()
    val completeMiles=number("total working miles|total miles including repositioning","mi|miles",10000.0)
    val completeMinutes=number("total working time|all working time","min|mins|minutes",2880.0)
    val travelMinutes=number("travel time|total travel time","min|mins|minutes",1440.0)
    val timingText=input.lineSequence().filterNot {it.contains("expires",true)}.joinToString("\n")
    val displayedTimes=Regex("(?<![\\w.\\-/])([0-9]{1,3}(?:\\.[0-9])?)\\s*(?:min|mins|minutes)\\b",RegexOption.IGNORE_CASE).findAll(timingText)
        .mapNotNull {it.groupValues[1].toDoubleOrNull()}.toList()
    val legacyMinutes=number("total time|estimated time|total","min|mins|minutes",1440.0) ?: displayedTimes.singleOrNull()
    val wait=number("pickup wait|wait time|wait","min|mins|minutes",240.0)
    val included=lower.contains("tips included") || lower.contains("includes tips")
    val separate=lower.contains("tips separate") || lower.contains("tips extra")
    val fields=CapturedOfferFields(currency,guaranteed,money("fees|additional costs|additional fees"),pickup,dropoff,pickupMiles,deliveryMiles,reposition,
        completeMiles,completeMinutes,travelMinutes,wait,money("confirmed tip"),money("unconfirmed tip|estimated tip"),
        if(included && !separate) "includedInQuote" else if(separate && !included) "separateFromQuote" else "unknown",
        if(completeMinutes!=null) "allWorkingTime" else if(travelMinutes!=null) "travelExcludingWait" else "unknown",
        unique("^offer id\\s*:\\s*([A-Za-z0-9_-]{1,80})[ \\t]*$"))
    return NormalizedCaptureFields(payout,displayedMiles,completeMinutes ?: travelMinutes ?: legacyMinutes,fields,
        hasLabel("$payoutLabels|guaranteed pay|guaranteed payout"))
}
