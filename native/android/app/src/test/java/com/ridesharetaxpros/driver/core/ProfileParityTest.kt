package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import kotlinx.serialization.encodeToString

class ProfileParityTest {
    private fun rating(score: Double = 4.6,at: String = "2026-11-07T12:00:00Z",scale: Double = 5.0)=ReputationRating(platformID="lyft-driver",platformName="Lyft Driver",recordedAt=at,score=score,scale=scale)
    @Test fun fifoAndExactAcknowledgementKeepDeletionPending() {
        val row=rating();val add=ReputationMutation(action="addRating",rating=row);val delete=ReputationMutation(action="deleteRating",id=row.id)
        val local=Journal().enqueueReputation(add).enqueueReputation(delete)
        assertEquals(listOf(add.mutationId,delete.mutationId),local.reputationOutbox.map {it.mutationId})
        val remote=ReputationState(ratings=listOf(row),acknowledgedMutationId=add.mutationId)
        val merged=local.mergeReputation(remote,add.mutationId)
        assertTrue(merged.reputationState.ratings.single().deleted)
        assertEquals(listOf(delete),merged.reputationOutbox)
        assertTrue(runCatching {local.mergeReputation(remote,delete.mutationId)}.isFailure)
        assertEquals(2,local.reputationOutbox.size)
    }
    @Test fun normalizationMatchesServerDatePrecisionWithoutChangingRetryContent() {
        val row=rating(at="2026-11-07T12:00:00.123456Z")
        val add=ReputationMutation(action="addRating",rating=row)
        val local=Journal().enqueueReputation(add)
        val pending=local.reputationOutbox.single()
        assertEquals("2026-11-07T12:00:00.123Z",pending.rating!!.recordedAt)
        val remote=ReputationState(ratings=listOf(pending.rating!!.copy(recordedAt="2026-11-07T12:00:00.123+00:00")))
        val merged=local.mergeReputation(remote)
        assertEquals(pending,merged.reputationOutbox.single())
        assertEquals(pending.rating,merged.reputationState.ratings.single())
        val restored=Wire.decodeFromString<Journal>(Wire.encodeToString(merged))
        assertEquals(merged.reputationOutbox,restored.reputationOutbox)
    }
    @Test fun conflictingIdentityAndInvalidScoresFailBeforeMutation() {
        val row=rating();val initial=Journal().enqueueReputation(ReputationMutation(action="addRating",rating=row))
        assertTrue(runCatching {initial.enqueueReputation(ReputationMutation(action="addRating",rating=row.copy(score=3.0)))}.isFailure)
        assertTrue(runCatching {row.copy(score=Double.NaN).validated()}.isFailure)
        assertTrue(runCatching {row.copy(score=5.1).validated()}.isFailure)
        assertTrue(runCatching {row.copy(scale=10.0).validated()}.isFailure)
        assertEquals(4.6,initial.reputationState.ratings.single().score,0.0)
    }
    @Test fun guestCopyPreservesTombstonesAndRepeatOperations() {
        val row=rating();val guest=Journal().enqueueReputation(ReputationMutation(action="addRating",rating=row)).enqueueReputation(ReputationMutation(action="deleteRating",id=row.id))
        val copied=Journal().copyGuestReputation(guest)
        assertTrue(copied.reputationState.ratings.single().deleted)
        assertEquals(2,copied.reputationOutbox.size)
        assertEquals(copied,copied.copyGuestReputation(guest))
        val account=Journal(reputationState=ReputationState(ratings=listOf(row.copy(deleted=true))))
        val source=Journal(reputationState=ReputationState(ratings=listOf(row)))
        assertTrue(account.copyGuestReputation(source).reputationState.ratings.single().deleted)
    }
    @Test fun equalTimestampsAndDifferentScalesNeverEstablishATrend() {
        val first=rating(at="2026-11-07T12:00:00Z")
        val equal=rating(score=4.8,at="2026-11-07T12:00:00.000Z")
        val percent=rating(score=95.0,at="2026-11-06T12:00:00Z",scale=100.0)
        val summary=reputationSummaries(ReputationState(ratings=listOf(first,percent,equal))).single()
        assertEquals(equal.id,summary.latest!!.id)
        assertNull(summary.change)
        val older=rating(score=4.5,at="2026-11-05T12:00:00Z")
        assertEquals(0.3,reputationSummaries(ReputationState(ratings=listOf(older,first,equal,percent))).single().change!!,0.0001)
    }
    @Test fun customPlatformHashPreservesPunctuationAndCanonicalWhitespace() {
        assertEquals(customReputationPlatformID("  Café   & Cargo "),customReputationPlatformID("cafe & cargo"))
        assertNotEquals(customReputationPlatformID("Cafe & Cargo"),customReputationPlatformID("Cafe Cargo"))
    }
    @Test fun coachNeverAddsFaresToPayoutsOrConvertsForeignCurrency() {
        val trip=DriverRecord.trip(Trip(startedAt="2026-11-07T12:00:00Z",endedAt="2026-11-07T13:00:00Z",localDate="2026-11-07",classification="business",distanceMeters=16093.44,earningsCents=10000,platformFeesCents=1000))
        val payout=DriverRecord.income(Income(date="2026-11-07",description="Payout",amountCents=10000))
        val foreign=DriverRecord.income(Income(date="2026-11-07",description="Foreign payout",amountCents=99999,currency="EUR"))
        val expense=DriverRecord.expense(Expense(date="2026-11-07",merchant="Supplies",amountCents=2000,classification="business",businessUsePercent=50))
        val journal=Journal(entries=listOf(trip,payout,foreign,expense).map {LocalEntry(it)},goals=Goals(vehicleCostCentsPerMile=50.0))
        val reply=localCoachAnswer("What are my expenses?",journal,"2026-11-07","2026-11-07")
        assertTrue(reply.message.text.contains("$90.00"))
        assertTrue(reply.message.text.contains("Trip fares are not added to saved income"))
        assertTrue(reply.message.text.contains("another currency"))
        assertFalse(reply.message.text.contains("$190.00"))
    }
    @Test fun coachExcludesFlaggedGpsJobsFromRankingAndDoesNotInventShiftHours() {
        val trip=DriverRecord.trip(Trip(startedAt="2026-11-07T12:00:00Z",endedAt="2026-11-07T13:00:00Z",localDate="2026-11-07",classification="business",distanceMeters=1609.344,earningsCents=1000,platformFeesCents=0,hasGaps=true))
        val journal=Journal(entries=listOf(LocalEntry(trip)),goals=Goals(vehicleCostCentsPerMile=50.0))
        assertTrue(localCoachAnswer("What pays me best?",journal,"2026-11-07","2026-11-07").message.text.contains("No individual trip can be ranked"))
        assertTrue(localCoachAnswer("How much idle time?",journal,"2026-11-07","2026-11-07").message.text.contains("cannot determine total shift hours"))
        assertTrue(localCoachAnswer("What pays me best?",journal,"invalid","2026-11-07").milestones.isEmpty())
    }
    @Test fun chatGuestCopyPreservesExactRetriesAndDestinationIntake() {
        val user=CoachMessage(role="user",text="Which jobs lose money?")
        val answer=CoachMessage(role="assistant",text="Saved local analysis",engine="local-record-rules")
        val original=CoachPendingMessage(user.id,user.text,"2026-11-01","2026-11-07",CoachPreferences(targetHourlyCents=2500),answer.id)
        val guest=Journal(coachMessages=listOf(user,answer),coachOutbox=listOf(original),coachIntake=CoachIntake(taxYear=2026))
        val destination=Journal(coachMessages=listOf(user.copy(createdAt="2026-11-07T12:00:00Z")),coachIntake=CoachIntake(taxYear=2025,jurisdiction="Connecticut"))
        val copied=destination.copyGuestCoach(guest)
        assertEquals(listOf(original),copied.coachOutbox)
        assertEquals(destination.coachIntake,copied.coachIntake)
        assertEquals(copied,copied.copyGuestCoach(guest))
        assertEquals(original.preferences,copied.coachOutbox.single().preferences)
    }
}
