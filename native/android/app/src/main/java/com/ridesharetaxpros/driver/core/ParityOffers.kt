package com.ridesharetaxpros.driver.core

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.Serializable

/** Complete driver-reviewed inputs; original capture evidence remains separate. */
@Serializable data class ReviewedGigOffer(
    val id: String = uuid(), val platform: String = "DoorDash", val source: String = "manual",
    val observedAt: String = now(), val payoutCents: Int? = null, val guaranteedCents: Int? = null,
    val additionalCostsCents: Int? = null, val totalMiles: Double? = null, val workingMinutes: Double? = null,
    val displayedMiles: Double? = null, val displayedMinutes: Double? = null,
    val waitMinutes: Double? = null, val repositionMiles: Double? = null,
    val pickup: String = "", val dropoff: String = "", val checked: Boolean = false,
    val advice: String? = null, val phase: String? = null, val startedAt: String? = null,
    val completedRecordId: String? = null
) {
    fun fresh(clock: Instant = Instant.now()) = runCatching {
        Duration.between(Instant.parse(observedAt), clock).seconds in 0..60
    }.getOrDefault(false)
    companion object {
        fun captured(value: ObservedGigOffer) = ReviewedGigOffer(id=value.id, platform=value.platform,
            source=value.source, observedAt=value.observedAt, payoutCents=value.payoutCents,
            displayedMiles=value.miles, displayedMinutes=value.minutes)
    }
}

data class OfferMoneyBand(val lower: Int, val upper: Int = lower)
data class ReviewedOfferAssessment(
    val vehicle: OfferMoneyBand? = null, val profit: OfferMoneyBand? = null,
    val reserve: OfferMoneyBand? = null, val cash: OfferMoneyBand? = null,
    val hourly: OfferMoneyBand? = null, val outcome: String = "needsReview", val issues: List<String> = emptyList()
)

/** Decimal cents and conservative pay bounds mirror the iOS profitability engine. */
fun assessReviewedOffer(offer: ReviewedGigOffer, costPerMile: Double?, hourlyGoal: Int?, reservePercent: Double = 0.0): ReviewedOfferAssessment {
    fun missing(message: String) = ReviewedOfferAssessment(issues=listOf(message))
    val quote = offer.payoutCents ?: return missing("Quoted payout is missing.")
    if (quote !in 0..100_000_000 || !reservePercent.isFinite() || reservePercent !in 0.0..100.0)
        return missing("Check the dollar amounts and reserve setting.")
    val cost = costPerMile?.takeIf { it.isFinite() && it in 0.0..10000.0 }
        ?: return missing("Set your estimated vehicle cost per mile.")
    val goal = hourlyGoal?.takeIf { it in 1..1_000_000 } ?: return missing("Set your hourly earnings target.")
    val miles = offer.totalMiles?.takeIf { it.isFinite() && it in 0.0..10000.0 }
        ?: return missing("Review all working miles, including unpaid driving.")
    val minutes = offer.workingMinutes?.takeIf { it.isFinite() && it in 1.0..2880.0 }
        ?: return missing("Review all working time, including pickup and waiting.")
    val additional = offer.additionalCostsCents?.takeIf { it in 0..100_000_000 }
        ?: return missing("Enter additional costs; enter 0 only if known.")
    val guarantee = offer.guaranteedCents
    if (guarantee != null && guarantee !in 0..quote) return missing("Guaranteed pay cannot exceed the quote.")
    fun rounded(value: BigDecimal, mode: RoundingMode = RoundingMode.HALF_UP) = value.setScale(0, mode).intValueExact()
    val vehicle = rounded(BigDecimal.valueOf(cost).multiply(BigDecimal.valueOf(miles)))
    val lowProfit = (guarantee ?: 0) - vehicle - additional
    val highProfit = quote - vehicle - additional
    fun reserve(profit: Int) = rounded(BigDecimal.valueOf(maxOf(0, profit).toLong())
        .multiply(BigDecimal.valueOf(reservePercent)).divide(BigDecimal(100)))
    val lowReserve = reserve(lowProfit); val highReserve = reserve(highProfit)
    val lowCash = lowProfit - lowReserve; val highCash = highProfit - highReserve
    fun hourly(cash: Int, mode: RoundingMode) = rounded(BigDecimal(cash).multiply(BigDecimal(60))
        .divide(BigDecimal.valueOf(minutes), 12, mode), mode)
    val hourlyLow = hourly(lowCash, RoundingMode.FLOOR); val hourlyHigh = hourly(highCash, RoundingMode.CEILING)
    val issues = mutableListOf<String>()
    if (guarantee == null) issues += "The guaranteed part of the quoted payout is unknown."
    if (lowCash != highCash) issues += "Pay uncertainty changes the estimate."
    val outcome = when {
        highProfit <= 0 -> "loss"
        lowProfit > 0 && hourlyLow >= goal -> "meetsGoal"
        lowProfit > 0 && hourlyHigh < goal -> "belowGoal"
        else -> "needsReview"
    }
    if (outcome == "needsReview") issues += "The available evidence does not establish whether the job meets your goal."
    return ReviewedOfferAssessment(OfferMoneyBand(vehicle), OfferMoneyBand(lowProfit, highProfit),
        OfferMoneyBand(lowReserve, highReserve), OfferMoneyBand(lowCash, highCash),
        OfferMoneyBand(hourlyLow, hourlyHigh), outcome, issues)
}

data class SampleOfferJourney(val offer: ReviewedGigOffer, val additionalMiles: Double? = null,
    val additionalMinutes: Double? = null, val arrival: String? = null, val reason: String,
    val recommended: Boolean = false)

/** The same deterministic paused examples as iOS; never saved in a real journal. */
fun sampleOfferJourneys(): List<SampleOfferJourney> {
    fun offer(id: String, platform: String, pay: Int, miles: Double?, minutes: Double?) =
        ReviewedGigOffer(id=id, platform=platform, source="simulation", payoutCents=pay,
            guaranteedCents=if(miles!=null) pay else null, additionalCostsCents=if(miles!=null) 0 else null,
            totalMiles=miles, workingMinutes=minutes, waitMinutes=if(miles!=null) 5.0 else null,
            repositionMiles=0.0, pickup="Example pickup", dropoff="Example drop-off", checked=true)
    return listOf(
        SampleOfferJourney(offer("sample:Uber","Uber",2800,9.0,34.0),-5.0,13.0,"5:48 PM",
            "Meets the pay target, stays within the deadline and ends at least as close by road.",true),
        SampleOfferJourney(offer("sample:DoorDash","DoorDash",2400,7.0,30.0),-5.0,10.0,"5:45 PM",
            "Meets the pay target, stays within the deadline and ends at least as close by road.",true),
        SampleOfferJourney(offer("sample:DoorDashIncomplete","DoorDash",1950,null,null),reason=
            "Missing current offer, matching destination or platform preference."),
        SampleOfferJourney(offer("sample:Spark","Spark",3800,18.0,77.0),16.0,72.0,"6:47 PM",
            "The full job plus onward travel exceeds the required arrival time."),
        SampleOfferJourney(offer("sample:Instacart","Instacart",400,13.0,50.0),5.0,35.0,"6:10 PM",
            "Estimated operating loss or break-even result.")
    )
}

fun reviewedOffers(journal: Journal): List<ReviewedGigOffer> =
    (journal.offerReviews + journal.observedOffers.filter { raw -> journal.offerReviews.none { it.id == raw.id } }
        .map(ReviewedGigOffer::captured)).sortedByDescending { it.observedAt }

fun Journal.saveReviewedOffer(offer: ReviewedGigOffer): Journal = copy(
    offerReviews=(offerReviews.filterNot { it.id == offer.id } + offer).takeLast(100))

fun ReviewedGigOffer.isActiveWork() = phase in setOf("accepted","inProgress","started")

/** User-reported work status, never a provider action or financial posting. */
fun Journal.reportOfferWork(offerId: String,next: String,clock: Instant = Instant.now()): Journal {
    val offer=reviewedOffers(this).firstOrNull {it.id==offerId} ?: error("This offer is no longer saved.")
    val allowed=when(offer.phase) {
        null -> setOf("accepted")
        "accepted" -> setOf("inProgress","completed","canceled")
        "inProgress","started" -> setOf("completed","canceled")
        else -> emptySet()
    }
    require(next in allowed) {"This job status changed. Review it before continuing."}
    if(next=="accepted") require(reviewedOffers(this).none {it.id!=offerId && it.isActiveWork()}) {
        "Complete or cancel your current job here before reporting another accepted offer."
    }
    return saveReviewedOffer(offer.copy(phase=next,startedAt=if(next=="inProgress") clock.toString() else offer.startedAt))
}
