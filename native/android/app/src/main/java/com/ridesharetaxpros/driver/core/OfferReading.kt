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
    val minutes: Double?, val comparisonSavedAt: String? = null,val expiresAt: String?=null,val withdrawn: Boolean=false,val fields: CapturedOfferFields=CapturedOfferFields()) {
    val fingerprint: String get() = MessageDigest.getInstance("SHA-256").digest("$platform|$payoutCents|$miles|$minutes|${Wire.encodeToString(CapturedOfferFields.serializer(),fields)}".toByteArray()).joinToString("") {"%02x".format(it)}
    fun fresh(clock: Instant = Instant.now()) = offerObservationFresh(observedAt,expiresAt,withdrawn,clock)
    fun estimate(settings: OfferReaderSettings, goals: Goals, clock: Instant = Instant.now()): ReadOfferEstimate? {
        if(!fresh(clock) || fields.currency!="USD" || !settings.active(clock) || readerSession!=settings.id || (platform!=settings.platform && platform !in settings.appPlatforms.values)) return null
        val quote=payoutCents ?: return null
        if((fields.unconfirmedTipCents ?: 0)>0 || fields.guaranteedCents?.let {it<quote}==true) return null
        val fare=quote+if(fields.tipTreatment=="separateFromQuote") fields.confirmedTipCents ?: 0 else 0
        val legs=if(fields.pickupMiles!=null && fields.deliveryMiles!=null && fields.repositionMiles!=null) fields.pickupMiles+fields.deliveryMiles+fields.repositionMiles else null
        val distance=fields.completeMiles ?: legs ?: miles ?: return null
        val duration=fields.completeMinutes ?: fields.travelMinutes ?: minutes ?: return null
        val fees=fields.additionalCostsCents ?: settings.feesCents ?: return null
        val wait=if(fields.completeMinutes!=null) 0.0 else fields.waitMinutes ?: settings.waitMinutes ?: return null
        val cost=goals.vehicleCostCentsPerMile ?: return null; val target=goals.targetHourlyCents ?: return null
        if(fare !in 1..100_000 || fees !in 0..100_000_000 || target !in 1..1_000_000 ||
            !listOf(distance,duration,wait,cost).all { it.isFinite() } || distance !in 0.0..10000.0 ||
            duration !in 1.0..1440.0 || wait !in 0.0..240.0 || cost !in 0.0..10000.0) return null
        val financial=assessReviewedOffer(ReviewedGigOffer.captured(this).copy(totalMiles=distance,workingMinutes=duration+wait,additionalCostsCents=fees),cost,target)
        val net=financial.cash?.upper ?: return null;val hourly=financial.hourly?.upper ?: return null
        return ReadOfferEstimate(net,hourly,financial.outcome=="meetsGoal",distance,duration+wait,fees)
    }
}
data class ReadOfferEstimate(val netCents: Int, val hourlyCents: Int, val meetsGoal: Boolean,
    val totalMiles: Double=0.0,val totalMinutes: Double=0.0,val feesCents: Int=0)

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
    require(previous.fingerprint==incoming.fingerprint || previous.sameProviderOffer(incoming))
    val expiry=earliestOfferExpiry(previous.expiresAt,incoming.expiresAt);val withdrawn=previous.withdrawn || incoming.withdrawn
    val age=runCatching {Duration.between(Instant.parse(previous.observedAt),Instant.parse(incoming.observedAt)).seconds}.getOrDefault(-1)
    if(age<0) return previous
    if(age<5 && previous.fingerprint==incoming.fingerprint && expiry==previous.expiresAt && withdrawn==previous.withdrawn && previous.readerSession==incoming.readerSession) return previous
    return incoming.copy(id=previous.id,expiresAt=expiry,withdrawn=withdrawn,comparisonSavedAt=previous.comparisonSavedAt.takeIf {previous.fingerprint==incoming.fingerprint})
}
fun ObservedGigOffer.sameProviderOffer(other: ObservedGigOffer)=platform==other.platform &&
    fields.providerOfferId?.takeIf {it.matches(Regex("[A-Za-z0-9_-]{1,80}"))}?.let {it==other.fields.providerOfferId}==true
data class OfferCaptureMerge(val journal: Journal,val observation: ObservedGigOffer,val changed: Boolean,val notify: Boolean)
/** Provider identity is platform-scoped; changed terms invalidate review, never recorded work status. */
fun Journal.ingestCapture(incoming: ObservedGigOffer): OfferCaptureMerge {
    val previous=observedOffers.lastOrNull {it.sameProviderOffer(incoming) || (it.fingerprint==incoming.fingerprint &&
        runCatching {Duration.between(Instant.parse(it.observedAt),Instant.parse(incoming.observedAt)).seconds in 0..120}.getOrDefault(false))}
    val merged=previous?.let {mergeObservedOffer(it,incoming)} ?: incoming
    if(merged==previous) return OfferCaptureMerge(this,merged,false,false)
    var state=copy(observedOffers=(observedOffers.filterNot {it.id==merged.id}+merged).takeLast(100))
    if(previous!=null && previous.fingerprint!=merged.fingerprint) {
        val status=offerReviews.firstOrNull {it.id==merged.id}
        state=state.saveReviewedOffer(ReviewedGigOffer.captured(merged).copy(phase=status?.phase,startedAt=status?.startedAt,completedRecordId=status?.completedRecordId))
    }
    return OfferCaptureMerge(state,merged,true,previous==null || previous.fingerprint!=merged.fingerprint || previous.withdrawn!=merged.withdrawn || previous.expiresAt!=merged.expiresAt)
}

object GigOfferTextReader {
    fun read(text: String,settings: OfferReaderSettings,source: String,clock: Instant = Instant.now()): ObservedGigOffer? {
        if(text.toByteArray(Charsets.UTF_8).size>20000 || !settings.active(clock)) return null
        val normalized=text.replace('\u00a0',' ');val lower=normalized.lowercase()
        if(source=="screenShare" && !lower.replace(" ","").contains(settings.platform.lowercase())) return null
        val availability=capturedOfferAvailability(normalized,clock)
        val parsed=normalizeCaptureFields(normalized)
        if(!parsed.hasExplicitOfferLabel && !availability.withdrawn && listOf("accept","new offer","delivery offer","trip radar","exclusive","available batch").none {lower.contains(it)}) return null
        if(parsed.payoutCents==null && parsed.displayedMiles==null && parsed.fields.pickupMiles==null) return null
        return ObservedGigOffer(platform=settings.platform,source=source,observedAt=clock.toString(),readerSession=settings.id,
            payoutCents=parsed.payoutCents,miles=parsed.displayedMiles,minutes=parsed.displayedMinutes,
            expiresAt=availability.expiresAt,withdrawn=availability.withdrawn,fields=parsed.fields)
    }
}
