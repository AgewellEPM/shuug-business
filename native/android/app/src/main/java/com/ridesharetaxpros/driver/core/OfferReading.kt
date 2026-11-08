package com.ridesharetaxpros.driver.core

import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.Serializable

val gigPlatforms = linkedMapOf("DoorDash" to "DoorDash", "Uber" to "Uber", "Lyft" to "Lyft", "Instacart" to "Instacart", "Spark" to "Spark")
@Serializable data class OfferReaderSettings(val id: String = uuid(), val enabled: Boolean = false,
    val platform: String = "DoorDash", val appPlatforms: Map<String,String> = emptyMap(),
    val feesCents: Int? = null, val waitMinutes: Double? = null, val expiresAt: String? = null) {
    fun active(clock: Instant = Instant.now()) = enabled && runCatching {expiresAt?.let { clock < Instant.parse(it) } == true}.getOrDefault(false)
    val allowedPackages get() = appPlatforms.keys
}
@Serializable data class ObservedGigOffer(val id: String = uuid(), val platform: String, val source: String,
    val observedAt: String = now(), val readerSession: String, val payoutCents: Int?, val miles: Double?,
    val minutes: Double?, val comparisonSavedAt: String? = null,val expiresAt: String?=null,val withdrawn: Boolean=false) {
    val fingerprint: String get() = MessageDigest.getInstance("SHA-256").digest("$platform|$payoutCents|$miles|$minutes".toByteArray()).joinToString("") {"%02x".format(it)}
    fun fresh(clock: Instant = Instant.now()) = offerObservationFresh(observedAt,expiresAt,withdrawn,clock)
    fun estimate(settings: OfferReaderSettings, goals: Goals, clock: Instant = Instant.now()): ReadOfferEstimate? {
        if(!fresh(clock) || !settings.active(clock) || readerSession!=settings.id || (platform!=settings.platform && platform !in settings.appPlatforms.values)) return null
        val fare=payoutCents ?: return null; val distance=miles ?: return null; val duration=minutes ?: return null
        val fees=settings.feesCents ?: return null; val wait=settings.waitMinutes ?: return null
        val cost=goals.vehicleCostCentsPerMile ?: return null; val target=goals.targetHourlyCents ?: return null
        if(fare !in 1..100_000 || fees !in 0..100_000_000 || target !in 1..1_000_000 ||
            !listOf(distance,duration,wait,cost).all { it.isFinite() } || distance !in 0.0..10000.0 ||
            duration !in 1.0..1440.0 || wait !in 0.0..240.0 || cost !in 0.0..10000.0) return null
        val net=fare-fees-distance*cost; val hourly=net*60/(duration+wait)
        return ReadOfferEstimate(net.toInt(),hourly.toInt(),hourly>=target)
    }
}
data class ReadOfferEstimate(val netCents: Int, val hourlyCents: Int, val meetsGoal: Boolean)

fun offerObservationFresh(observedAt: String,expiresAt: String?,withdrawn: Boolean,clock: Instant)=!withdrawn && runCatching {
    Duration.between(Instant.parse(observedAt),clock).seconds in 0..60 && (expiresAt?.let {Instant.parse(it)>clock} ?: true)
}.getOrDefault(false)
fun earliestOfferExpiry(first: String?,second: String?): String? {
    if(first==null) return second;if(second==null) return first
    val a=runCatching {Instant.parse(first)}.getOrNull() ?: return first
    val b=runCatching {Instant.parse(second)}.getOrNull() ?: return second
    return if(a<=b) first else second
}
data class CapturedOfferAvailability(val expiresAt: String?,val withdrawn: Boolean)
/** Only explicit expiry labels and withdrawal statements are interpreted. */
fun capturedOfferAvailability(text: String,clock: Instant): CapturedOfferAvailability {
    val absolute=Regex("(?im)^\\s*expires at\\s*:\\s*([0-9TZ:+.\\-]+)\\s*$").findAll(text)
        .mapNotNull {runCatching {Instant.parse(it.groupValues[1])}.getOrNull()}.toList()
    val relative=Regex("(?i)\\bexpires in\\s*[:\\-]?\\s*([0-9]{1,4}(?:\\.[0-9]+)?)\\s*(seconds?|sec|s|minutes?|mins?|m)\\b").findAll(text).mapNotNull {
        val number=it.groupValues[1].toDoubleOrNull() ?: return@mapNotNull null
        val seconds=number*(if(it.groupValues[2].lowercase().startsWith("m")) 60 else 1)
        seconds.takeIf {value->value.isFinite() && value in 0.0..3600.0}?.let {value->clock.plusMillis((value*1000).toLong())}
    }.toList()
    val expiry=(absolute+relative).minOrNull()?.toString()
    val withdrawn=Regex("(?i)\\b(?:offer (?:is |was )?(?:withdrawn|removed|no longer available|unavailable)|availability(?: status)?\\s*[:=]\\s*withdrawn)\\b").containsMatchIn(text)
    return CapturedOfferAvailability(expiry,withdrawn)
}
/** Repeat OCR cannot extend a known expiration or reactivate withdrawn work. */
fun mergeObservedOffer(previous: ObservedGigOffer,incoming: ObservedGigOffer): ObservedGigOffer {
    require(previous.fingerprint==incoming.fingerprint)
    val expiry=earliestOfferExpiry(previous.expiresAt,incoming.expiresAt);val withdrawn=previous.withdrawn || incoming.withdrawn
    val age=runCatching {Duration.between(Instant.parse(previous.observedAt),Instant.parse(incoming.observedAt)).seconds}.getOrDefault(-1)
    if(age<0) return previous
    if(age<5 && expiry==previous.expiresAt && withdrawn==previous.withdrawn && previous.readerSession==incoming.readerSession) return previous
    return incoming.copy(id=previous.id,expiresAt=expiry,withdrawn=withdrawn,comparisonSavedAt=previous.comparisonSavedAt)
}

object GigOfferTextReader {
    fun read(text: String,settings: OfferReaderSettings,source: String,clock: Instant = Instant.now()): ObservedGigOffer? {
        if(text.length>20000 || !settings.active(clock)) return null
        val normalized=text.replace('\u00a0',' '); val lower=normalized.lowercase()
        if(source=="screenShare" && !lower.replace(" ","").contains(settings.platform.lowercase())) return null
        val availability=capturedOfferAvailability(normalized,clock)
        if(!availability.withdrawn && listOf("accept","new offer","delivery offer","trip radar","exclusive","available batch","offer payout").none {lower.contains(it)}) return null
        fun values(pattern: String,input: String=normalized)=Regex(pattern,RegexOption.IGNORE_CASE).findAll(input).map {it.groupValues[1]}.toList()
        val amounts=values("\\$\\s*([0-9]{1,4}(?:\\.[0-9]{2})?)\\b").mapNotNull {runCatching {StatementImport.cents(it)}.getOrNull()}.distinct()
        val labeled=values("(?:offer payout|estimated earnings|guaranteed pay|total pay|payout)\\s*[:\\-]?\\s*\\$\\s*([0-9]{1,4}(?:\\.[0-9]{2})?)\\b").mapNotNull {runCatching {StatementImport.cents(it)}.getOrNull()}.distinct()
        val amount=(labeled.singleOrNull() ?: amounts.singleOrNull())?.takeIf {it in 1..100_000}
        fun distance(prefix: String)=values(prefix+"\\s*[:\\-]?\\s*([0-9]{1,3}(?:\\.[0-9]{1,2})?)\\s*(?:mi|miles)\\b").mapNotNull {it.toDoubleOrNull()}.singleOrNull()
        val allMiles=values("\\b([0-9]{1,3}(?:\\.[0-9]{1,2})?)\\s*(?:mi|miles)\\b").mapNotNull {it.toDoubleOrNull()}
        val pickup=distance("(?:pickup|pick-up|to pickup)");val delivery=distance("(?:delivery|drop-off|dropoff)")
        val miles=distance("(?:total|total distance)") ?: if(pickup!=null && delivery!=null) pickup+delivery else allMiles.singleOrNull()
        val timingText=normalized.lineSequence().filterNot {it.contains("expires",true)}.joinToString("\n")
        val allMinutes=values("\\b([0-9]{1,3}(?:\\.[0-9])?)\\s*(?:min|mins|minutes)\\b",timingText).mapNotNull {it.toDoubleOrNull()}
        val labeledMinutes=values("(?:total time|estimated time|total)\\s*[:\\-]?\\s*([0-9]{1,3}(?:\\.[0-9])?)\\s*(?:min|mins|minutes)\\b",timingText).mapNotNull {it.toDoubleOrNull()}
        val minutes=labeledMinutes.singleOrNull() ?: allMinutes.singleOrNull()
        if(amount==null && miles==null && minutes==null) return null
        return ObservedGigOffer(platform=settings.platform,source=source,observedAt=clock.toString(),readerSession=settings.id,payoutCents=amount,miles=miles,minutes=minutes,expiresAt=availability.expiresAt,withdrawn=availability.withdrawn)
    }
}
