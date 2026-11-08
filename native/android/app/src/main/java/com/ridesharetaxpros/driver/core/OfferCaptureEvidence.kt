package com.ridesharetaxpros.driver.core

import java.time.Instant

/** Exact reviewed inputs and user-selected endpoints, held only in process memory. */
data class OfferRouteEvidence(val offer: ReviewedGigOffer,val goals: Goals,val reservePercent: Double,
    val roads: OfferRoadJourney,val preferences: OfferRoadPreferences)

object OfferRouteEvidenceCache {
    private val entries=linkedMapOf<String,OfferRouteEvidence>()
    @Synchronized fun put(scope: String,evidence: OfferRouteEvidence) {
        val key="$scope|${evidence.offer.id}";entries.remove(key)
        while(entries.size>=16) entries.remove(entries.keys.first())
        entries[key]=evidence
    }
    @Synchronized fun get(scope: String,id: String)=entries["$scope|$id"]
    @Synchronized fun remove(scope: String,id: String) {entries.remove("$scope|$id")}
}

data class OfferCaptureReport(val captures: List<ObservedGigOffer>,val reviewed: ReviewedGigOffer?,
    val financial: ReviewedOfferAssessment?,val recommendation: OfferRoadAssessment?,val sufficient: Boolean,val blockers: List<String>)

fun offerCaptureReport(journal: Journal,platform: String,evidence: OfferRouteEvidence?,clock: Instant=Instant.now()): OfferCaptureReport {
    val captures=journal.observedOffers.filter {it.platform==platform && it.source in setOf("sharedScreenshot","sharedText","screenShare") &&
        runCatching {Instant.parse(it.observedAt)<=clock}.getOrDefault(false)}.sortedByDescending {it.observedAt}
    val capture=captures.firstOrNull() ?: return OfferCaptureReport(emptyList(),null,null,null,false,
        listOf("No captured offer is saved for this platform in this account. Manual entries and sample data do not count."))
    val offer=reviewedOffers(journal).firstOrNull {it.id==capture.id} ?: ReviewedGigOffer.captured(capture)
    val blockers=mutableListOf<String>()
    if(!offer.fresh(clock)) blockers+="This observation is stale, expired or withdrawn. Check the current offer again."
    if(!offer.checked) blockers+="The extracted fields and current availability have not been reviewed in the original gig app."
    val matching=evidence?.takeIf {it.offer==offer && it.goals==journal.goals && it.reservePercent==(journal.taxReservePercent ?: 0.0)}
    val road=matching?.let {assessOfferRoad(offer,it.roads,it.preferences,journal.goals,it.reservePercent,
        reviewedOffers(journal).any {row->row.id!=offer.id && row.isActiveWork()},clock)}
    if(matching==null) blockers+="A current full route to pickup, drop-off and your destination has not been checked for these offer fields and cost settings."
    else if(road?.outcome=="needsReview") blockers+=road.reason
    val financial=road?.financial ?: assessReviewedOffer(offer,journal.goals.vehicleCostCentsPerMile,journal.goals.targetHourlyCents,journal.taxReservePercent ?: 0.0)
    if(financial.outcome=="needsReview") blockers+="The pay estimate is incomplete or its uncertainty crosses your earnings target."
    return OfferCaptureReport(captures,offer,financial,road,blockers.isEmpty() && road?.outcome in setOf("aligned","tradeoff","skip"),blockers.distinct())
}
