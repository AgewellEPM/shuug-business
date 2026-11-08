package com.ridesharetaxpros.driver.core

import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.data.WorkspaceClient
import java.net.URI
import java.text.Normalizer
import java.security.MessageDigest
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.WeakHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.math.*

@Serializable data class ReputationRating(val id: String = uuid(), val platformID: String, val platformName: String,
    val recordedAt: String = now(), val score: Double, val scale: Double = 5.0, val reviewCount: Int? = null,
    val notes: String = "", val deleted: Boolean = false) {
    fun validated(): ReputationRating {
        require(platformID.trim().length in 1..80 && platformName.trim().length in 1..80) { "Use an app ID and name between 1 and 80 characters." }
        java.util.UUID.fromString(id); Instant.parse(recordedAt)
        require(scale == 5.0 || scale == 100.0) { "Choose a rating scale of 5 or 100." }
        require(score.isFinite() && score in 0.0..scale) { "Enter a score from zero through the selected scale." }
        require(reviewCount == null || reviewCount in 0..1_000_000_000) { "Review count must be between zero and 1,000,000,000, or left blank." }
        require(notes.length <= 500) { "Keep rating notes within 500 characters." }
        return copy(id=java.util.UUID.fromString(id).toString(),recordedAt=Instant.parse(recordedAt).truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString(),
            score=if(score==0.0) 0.0 else score,platformID=platformID.trim(), platformName=platformName.trim())
    }
}
@Serializable data class ReputationReview(val id: String = uuid(), val platformID: String, val platformName: String,
    val recordedAt: String = now(), val text: String, val sentiment: String = "unreviewed",
    val topics: List<String> = emptyList(), val deleted: Boolean = false) {
    fun validated(): ReputationReview {
        require(platformID.trim().length in 1..80 && platformName.trim().length in 1..80) { "Use an app ID and name between 1 and 80 characters." }
        java.util.UUID.fromString(id); Instant.parse(recordedAt)
        require(text.trim().length in 1..2000) { "Enter review text between 1 and 2,000 characters." }
        require(sentiment in sentiments) { "Choose positive, mixed, negative, or unreviewed feedback." }
        require(topics.distinct().size == topics.size && topics.all { it in supportedTopics }) { "Choose supported feedback topics without duplicates." }
        return copy(id=java.util.UUID.fromString(id).toString(),recordedAt=Instant.parse(recordedAt).truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString(),
            platformID=platformID.trim(), platformName=platformName.trim(), text=text.trim())
    }
    companion object {
        val sentiments = listOf("positive", "mixed", "negative", "unreviewed")
        val supportedTopics = listOf("communication", "timing", "accuracy", "handling", "professionalism", "other")
    }
}
@Serializable data class ReputationMutation(val mutationId: String = uuid(), val action: String,
    val rating: ReputationRating? = null, val review: ReputationReview? = null, val id: String? = null) {
    fun validated(): ReputationMutation {
        java.util.UUID.fromString(mutationId)
        return when (action) {
            "addRating" -> { require(rating != null && !rating.deleted && review == null && id == null); copy(rating=rating.validated()) }
            "addReview" -> { require(review != null && !review.deleted && rating == null && id == null); copy(review=review.validated()) }
            "deleteRating", "deleteReview" -> { require(id != null && rating == null && review == null); java.util.UUID.fromString(id); this }
            else -> error("This reputation change has an invalid action or record.")
        }
    }
}
@Serializable data class ReputationState(val apiVersion: Int = 1, val ratings: List<ReputationRating> = emptyList(),
    val reviews: List<ReputationReview> = emptyList(), val acknowledgedMutationId: String? = null) {
    fun validated(): ReputationState {
        val cleanRatings=ratings.map {it.validated()}; val cleanReviews=reviews.map {it.validated()}
        require(apiVersion == 1 && ratings.size <= 500 && reviews.size <= 500 && cleanRatings.distinctBy { it.id }.size == ratings.size && cleanReviews.distinctBy { it.id }.size == reviews.size) { "The personal ratings response is incomplete or unsupported. Your saved entries were kept." }
        return copy(ratings=cleanRatings,reviews=cleanReviews)
    }
    fun applying(input: ReputationMutation): ReputationState {
        val change = input.validated()
        val canonical=validated()
        if(canonical!=this) return canonical.applying(change)
        return when (change.action) {
            "addRating" -> {
                val value=change.rating!!; val prior=ratings.firstOrNull { it.id==value.id }
                require(prior == null || prior.copy(deleted=false)==value) { "A different rating already uses this ID. Existing history was kept." }
                require(prior != null || ratings.size < 500) { "This account can keep up to 500 rating snapshots." }
                if (prior == null) copy(ratings=ratings+value) else this
            }
            "addReview" -> {
                val value=change.review!!; val prior=reviews.firstOrNull { it.id==value.id }
                require(prior == null || prior.copy(deleted=false)==value) { "A different review already uses this ID. Existing history was kept." }
                require(prior != null || reviews.size < 500) { "This account can keep up to 500 saved reviews." }
                if (prior == null) copy(reviews=reviews+value) else this
            }
            "deleteRating" -> copy(ratings=ratings.map { if(it.id==change.id) it.copy(deleted=true) else it })
            else -> copy(reviews=reviews.map { if(it.id==change.id) it.copy(deleted=true) else it })
        }
    }
}
fun Journal.enqueueReputation(input: ReputationMutation): Journal {
    val change=input.validated(); val prior=reputationOutbox.firstOrNull { it.mutationId==change.mutationId }
    if(prior != null) { require(prior==change) { "A saved reputation mutation has conflicting contents." }; return this }
    require(reputationOutbox.size < 50) { "Sync the personal rating and review changes waiting to share before adding more." }
    return copy(reputationState=reputationState.validated().applying(change), reputationOutbox=reputationOutbox+change)
}
fun Journal.mergeReputation(remote: ReputationState, acknowledging: String? = null): Journal {
    var state=remote.validated(); require(reputationOutbox.size <= 50)
    if(acknowledging != null) require(remote.acknowledgedMutationId == acknowledging) { "The workspace did not acknowledge this exact ratings change. It is saved for retry." }
    val pending=reputationOutbox.filterNot { it.mutationId==acknowledging }
    for(operation in pending) state=state.applying(operation)
    return copy(reputationState=state.copy(acknowledgedMutationId=null), reputationOutbox=pending)
}
/** Guest copy reuses original immutable operations and never resurrects tombstones. */
fun Journal.copyGuestReputation(source: Journal): Journal {
    source.reputationState.validated(); reputationState.validated()
    var state=this
    for(rating in source.reputationState.ratings) {
        val prior=state.reputationState.ratings.firstOrNull { it.id==rating.id }
        require(prior == null || prior.copy(deleted=false)==rating.copy(deleted=false)) { "A rating identifier has conflicting saved contents. Both journals were kept." }
        if(prior == null) {
            val operation=source.reputationOutbox.firstOrNull { it.action=="addRating" && it.rating?.id==rating.id }
                ?: ReputationMutation(action="addRating",rating=rating.copy(deleted=false))
            state=state.enqueueReputation(operation)
        }
        if(rating.deleted && prior?.deleted != true && state.reputationOutbox.none { it.action=="deleteRating" && it.id==rating.id })
            state=state.enqueueReputation(source.reputationOutbox.firstOrNull { it.action=="deleteRating" && it.id==rating.id } ?: ReputationMutation(action="deleteRating",id=rating.id))
    }
    for(review in source.reputationState.reviews) {
        val prior=state.reputationState.reviews.firstOrNull { it.id==review.id }
        require(prior == null || prior.copy(deleted=false)==review.copy(deleted=false)) { "A review identifier has conflicting saved contents. Both journals were kept." }
        if(prior == null) state=state.enqueueReputation(source.reputationOutbox.firstOrNull { it.action=="addReview" && it.review?.id==review.id }
            ?: ReputationMutation(action="addReview",review=review.copy(deleted=false)))
        if(review.deleted && prior?.deleted != true && state.reputationOutbox.none { it.action=="deleteReview" && it.id==review.id })
            state=state.enqueueReputation(source.reputationOutbox.firstOrNull { it.action=="deleteReview" && it.id==review.id } ?: ReputationMutation(action="deleteReview",id=review.id))
    }
    return state
}

val reputationPlatforms = linkedMapOf("lyft-driver" to "Lyft Driver", "uber-driver" to "Uber Driver", "doordash-dasher" to "Dasher",
    "spark-driver" to "Spark Driver", "instacart-shopper" to "Instacart Shopper", "amazon-flex" to "Amazon Flex",
    "grubhub-driver" to "Grubhub Driver", "roadie-driver" to "Roadie Driver", "shipt-shopper" to "Shipt Shopper",
    "gopuff-driver" to "Gopuff Driver", "universal-delivery" to "Universal Delivery", "in-store-shopper" to "In-store Shopper")
fun reputationOptions(state: ReputationState): Map<String,String> = reputationPlatforms.toMutableMap().apply {
    state.ratings.filterNot { it.deleted }.forEach { put(it.platformID,it.platformName) }
    state.reviews.filterNot { it.deleted }.forEach { put(it.platformID,it.platformName) }
}
fun profileNumber(value: Double): String = "%.3f".format(Locale.US,value).trimEnd('0').trimEnd('.')
fun profileDay(value: String): String = Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate().toString()
fun normalizedProfileText(value: String): String = Normalizer.normalize(value,Normalizer.Form.NFD).replace(Regex("\\p{M}"),"").lowercase(Locale.US).replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
fun customReputationPlatformID(name: String): String {
    val normalized=Normalizer.normalize(name.trim(),Normalizer.Form.NFD).replace(Regex("\\p{M}"),"").lowercase(Locale.US).replace("ß","ss").split(Regex("\\s+")).joinToString(" ")
    return "custom-"+MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8)).take(12).joinToString("") {"%02x".format(it)}
}
fun reputationQuery(text: String): Boolean {
    val normalized=" "+normalizedProfileText(text)+" "
    return listOf("rating","ratings","rated","star","stars","reputation","feedback").any { normalized.contains(" $it ") } ||
        listOf("customer score","customer scores","customer review","customer reviews","my review","my reviews","personal review","personal reviews","app review","app reviews").any { normalized.contains(" $it ") }
}
data class ReputationSummary(val platformID: String, val platformName: String, val latest: ReputationRating?, val previous: ReputationRating?,
    val ratings: List<ReputationRating>, val reviews: List<ReputationReview>) {
    val change get() = if(latest!=null && previous!=null) latest.score-previous.score else null
}
fun reputationSummaries(state: ReputationState, platformID: String? = null): List<ReputationSummary> {
    val ratings=state.ratings.filterNot { it.deleted }; val reviews=state.reviews.filterNot { it.deleted }
    return (ratings.map { it.platformID }+reviews.map { it.platformID }).distinct().filter { platformID==null || it==platformID }.map { id ->
        val history=ratings.withIndex().filter { it.value.platformID==id }.sortedWith(compareByDescending<IndexedValue<ReputationRating>> { Instant.parse(it.value.recordedAt) }.thenByDescending { it.index }).map { it.value }
        val feedback=reviews.filter { it.platformID==id }; val latest=history.firstOrNull()
        ReputationSummary(id,latest?.platformName ?: feedback.maxByOrNull { Instant.parse(it.recordedAt) }?.platformName ?: id,
            latest,history.firstOrNull { latest!=null && it.id!=latest.id && it.scale==latest.scale && Instant.parse(it.recordedAt)<Instant.parse(latest.recordedAt) },history,feedback)
    }.sortedBy { it.platformName.lowercase(Locale.US) }
}
fun reputationImprovement(topic: String): String = when(topic) {
    "communication" -> "Confirm instructions and send a clear update when plans change."
    "timing" -> "Check timing commitments before accepting and communicate delays early; avoid rushing."
    "accuracy" -> "Compare the job or shopping list with completed items before handoff and clarify uncertain substitutions."
    "handling" -> "Follow handling instructions and protect items during preparation and handoff."
    "professionalism" -> "Keep messages and handoffs calm, respectful, and concise."
    else -> "Re-read this tagged feedback, choose one specific change, and check it after the next jobs. Add a more specific topic when appropriate."
}
fun reputationAnswer(query: String, state: ReputationState, platformID: String? = null): String {
    val all=reputationSummaries(state); val question=" "+normalizedProfileText(query)+" "
    val matches=all.filter { question.contains(" "+normalizedProfileText(it.platformName)+" ") || question.contains(" "+normalizedProfileText(it.platformID)+" ") }
    val chosen=platformID ?: matches.singleOrNull()?.platformID
    val selected=all.filter { chosen==null || it.platformID==chosen }
    val lines=mutableListOf("Based on all saved manual reputation history, independent of the selected financial date range.")
    if(selected.isEmpty()) lines+="No manual rating snapshots or review records are saved for this selection. Add a dated rating from the app and any feedback you want to track. Choose sentiment and topics yourself to ground improvement steps."
    selected.take(10).forEach { summary ->
        val section=mutableListOf(summary.platformName+":")
        val latest=summary.latest
        section+=if(latest==null) "No rating snapshot saved for this app." else "Latest manual snapshot: ${profileNumber(latest.score)}/${profileNumber(latest.scale)} on ${profileDay(latest.recordedAt)}."
        latest?.reviewCount?.let { section+="Entered provider review count: $it." }
        section+=summary.change?.let { "Same-app, same-scale change: ${if(it>0) "+" else ""}${profileNumber(it)} from ${profileNumber(summary.previous!!.score)}/${profileNumber(summary.previous.scale)} on ${profileDay(summary.previous.recordedAt)}. These are two recorded snapshots, not a forecast." }
            ?: "A trend needs another earlier snapshot from this app on the same scale. Different apps or scales are not combined."
        section+="Saved history: ${summary.ratings.size} rating snapshots and ${summary.reviews.size} review records."
        for(positive in listOf(true,false)) {
            val feedback=summary.reviews.filter { if(positive) it.sentiment=="positive" else it.sentiment in listOf("mixed","negative") }
            val groups=feedback.flatMap { r -> r.topics.ifEmpty { listOf("other") }.map { it to r.id } }.groupBy({it.first},{it.second})
            if(groups.isEmpty() && !positive) section+="No user-tagged mixed or negative feedback supports an improvement finding for this app."
            groups.entries.sortedWith(compareByDescending<Map.Entry<String,List<String>>> { it.value.size }.thenBy { it.key }).forEach { (topic,ids) ->
                section+="${topic.replaceFirstChar { it.uppercase() }}: "+(if(positive) "You marked ${ids.size} saved reviews positive for $topic. Keep the practices described in those records." else reputationImprovement(topic))+" Evidence review IDs: ${ids.take(3).joinToString()}${if(ids.size>3) " (+${ids.size-3} more)" else ""}."
            }
        }
        val unreviewed=summary.reviews.count { it.sentiment=="unreviewed" }; if(unreviewed>0) section+="$unreviewed reviews are unreviewed. Choose sentiment and topics before identifying strengths or concerns."
        lines+=section.joinToString("\n")
    }
    lines+="These records do not reveal a provider's scoring calculation, establish account thresholds, prove why a score changed, or guarantee a higher rating."
    return lines.joinToString("\n\n")
}

@Serializable data class CoachSource(val id: String,val title: String,val url: String)
@Serializable data class CoachMessage(val id: String = uuid(),val role: String,val text: String,val createdAt: String = now(),
    val engine: String? = null,val sources: List<CoachSource>? = null,val recordIds: List<String>? = null)
@Serializable data class CoachPreferences(val dailyNetCents: Int? = null,val weeklyNetCents: Int? = null,
    val targetHourlyCents: Int? = null,val vehicleCostCentsPerMile: Double? = null) {
    companion object { fun from(goals: Goals)=CoachPreferences(goals.dailyNetCents,goals.weeklyNetCents,goals.targetHourlyCents,goals.vehicleCostCentsPerMile) }
}
@Serializable data class CoachIntake(val taxYear: Int? = null,val jurisdiction: String? = null,val businessType: String? = null)
@Serializable data class CoachMilestone(val id: String,val title: String,val detail: String,val status: String = "todo",val recordIds: List<String> = emptyList())
@Serializable data class CoachEngine(val mode: String = "record-rules",val peelAvailable: Boolean = false,val llmAvailable: Boolean = false)
@Serializable data class CoachState(val apiVersion: Int = 1,val messages: List<CoachMessage> = emptyList(),val preferences: CoachPreferences = CoachPreferences(),
    val intake: CoachIntake = CoachIntake(),val milestones: List<CoachMilestone> = emptyList(),val engine: CoachEngine = CoachEngine())
@Serializable data class CoachPendingMessage(val id: String,val text: String,val from: String,val through: String,
    val preferences: CoachPreferences,val localReplyId: String)
/** Explicit opt-in copy preserves immutable retries and destination tax details. */
fun Journal.copyGuestCoach(source: Journal): Journal {
    val messages=coachMessages.associateByTo(linkedMapOf()) {it.id}
    for(message in source.coachMessages) {
        val prior=messages[message.id]
        require(prior==null || prior.role==message.role && prior.text==message.text) {"A chat identifier has conflicting contents. Both journals were kept."}
        if(prior==null) messages[message.id]=message
    }
    val pending=coachOutbox.associateByTo(linkedMapOf()) {it.id}
    for(message in source.coachOutbox) {
        val prior=pending[message.id]
        require(prior==null || prior==message) {"A pending question has conflicting retry contents. Both journals were kept."}
        if(prior==null) pending[message.id]=message
    }
    require(pending.size<=50) {"More than 50 questions would be waiting to share. Sync first; both journals were kept."}
    // A visible message is not an acknowledgement. Copied pending IDs retry as-is.
    // Intake, milestones and engine remain those of the destination account.
    return copy(coachMessages=messages.values.sortedBy {Instant.parse(it.createdAt)},coachOutbox=pending.values.toList())
}
@Serializable private data class CoachMessageInput(val action: String = "message",val mutationId: String,val messageId: String,val text: String,val from: String,val through: String,val preferences: CoachPreferences? = null)
@Serializable private data class CoachIntakeInput(val action: String = "intake",val mutationId: String,val answers: CoachIntake,val confirmed: Boolean = true)

private object ProfileLocks {
    private val ratings=WeakHashMap<DriverRepository,Mutex>(); private val chat=WeakHashMap<DriverRepository,Mutex>()
    fun forRepo(repo: DriverRepository, coach: Boolean = false): Mutex = synchronized(this) { (if(coach) chat else ratings).getOrPut(repo) { Mutex() } }
}
fun DriverRepository.saveProfileMutation(mutation: ReputationMutation) { update { it.enqueueReputation(mutation) } }
suspend fun DriverRepository.syncProfileReputation(): String = ProfileLocks.forRepo(this).withLock {
    val profile=connection ?: return@withLock "Saved on this phone · Connect to share with your tax team"
    val expected=scope; val client=WorkspaceClient(profile)
    fun same()=scope==expected && connection==profile
    try {
        for(operation in journal.reputationOutbox.toList()) {
            val state=Wire.decodeFromString<ReputationState>(client.send("reputation","POST",Wire.encodeToString(operation).toByteArray()).toString(Charsets.UTF_8))
            if(!same()) return@withLock "Account changed. Reopen this screen to refresh."
            update { it.mergeReputation(state,operation.mutationId) }
        }
        val state=Wire.decodeFromString<ReputationState>(client.send("reputation").toString(Charsets.UTF_8))
        if(!same()) return@withLock "Account changed. Reopen this screen to refresh."
        update { it.mergeReputation(state) }
        if(journal.reputationOutbox.isEmpty()) "Shared with ${profile.session.branding.name} · Your recorded entries" else "Saved on this phone · Newer changes are waiting to share"
    } catch(error: Exception) { if(error is CancellationException) throw error; if(same()) "Saved on this phone · Sharing pending: ${error.message}" else "Account changed. Saved records were kept." }
}
private fun Journal.mergeCoach(state: CoachState,intakeMutation: String? = null,acknowledgedMessageID: String? = null): Journal {
    require(state.apiVersion==1) { "The workspace needs an update before sharing chat." }
    val received=state.messages.filter { it.role=="user" }.map { it.id }.toSet()
    val acknowledged=coachOutbox.filter { it.id in received || it.id==acknowledgedMessageID }
    val replaced=acknowledged.filter { it.id in received }.map { it.localReplyId }.toSet()
    val retained=acknowledged.filterNot { it.id in received }.map { it.localReplyId }.toSet()
    val messages=linkedMapOf<String,CoachMessage>()
    coachMessages.filterNot { it.id in replaced }.forEach { messages[it.id]=if(it.id in retained) it.copy(engine="phone-record-rules") else it }
    state.messages.forEach { messages[it.id]=it }
    val pending=coachOutbox.filterNot { candidate -> acknowledged.any { it.id==candidate.id } }
    val mutation=if(coachIntakeMutationId==intakeMutation) null else coachIntakeMutationId
    return copy(coachMessages=messages.values.sortedBy { Instant.parse(it.createdAt) },coachOutbox=pending,
        coachIntake=if(mutation==null) state.intake else coachIntake,coachIntakeMutationId=mutation,coachMilestones=state.milestones,coachEngine=state.engine)
}
suspend fun DriverRepository.syncTaxCoach(from: String,through: String): String = ProfileLocks.forRepo(this,true).withLock {
    val profile=connection ?: return@withLock "On this phone · Connect to share with your firm"
    val expected=scope; val client=WorkspaceClient(profile)
    fun same()=scope==expected && connection==profile
    try {
        sync()
        if(!same()) return@withLock "Account changed. Saved records were kept."
        if(busy || journal.pendingReceipts.isNotEmpty() || journal.pendingRecords.isNotEmpty() || journal.entries.any { it.conflict!=null }) return@withLock "Phone analysis shown · Finish record sync or review conflicts before workspace answers"
        if(journal.coachOutbox.any { reputationQuery(it.text) }) {
            val sharedReputation=syncProfileReputation()
            if(!same()) return@withLock "Account changed. Saved records were kept."
            if(!sharedReputation.startsWith("Shared with") || journal.reputationOutbox.isNotEmpty()) return@withLock "Phone analysis shown · Sync ratings and reviews before workspace answers"
        }
        journal.coachIntakeMutationId?.let { mutation ->
            val state=Wire.decodeFromString<CoachState>(client.send("coach","POST",Wire.encodeToString(CoachIntakeInput(mutationId=mutation,answers=journal.coachIntake)).toByteArray()).toString(Charsets.UTF_8))
            if(!same()) return@withLock "Account changed. Saved records were kept."
            update { it.mergeCoach(state,intakeMutation=mutation) }
        }
        for(message in journal.coachOutbox.toList()) {
            val input=CoachMessageInput(mutationId=message.id,messageId=message.id,text=message.text,from=message.from,through=message.through,
                preferences=if(reputationQuery(message.text)) null else message.preferences)
            val state=Wire.decodeFromString<CoachState>(client.send("coach","POST",Wire.encodeToString(input).toByteArray()).toString(Charsets.UTF_8))
            if(!same()) return@withLock "Account changed. Saved records were kept."
            update { it.mergeCoach(state,acknowledgedMessageID=message.id) }
        }
        val first=LocalDate.parse(from).toString(); val last=LocalDate.parse(through).toString()
        val state=Wire.decodeFromString<CoachState>(client.send("coach?from=$first&through=$last").toString(Charsets.UTF_8))
        if(!same()) return@withLock "Account changed. Saved records were kept."
        update { it.mergeCoach(state) }
        if(journal.coachOutbox.isEmpty() && journal.coachIntakeMutationId==null) "Shared with ${profile.session.branding.name} · Same client account as the website" else "Saved on this phone · Newer questions or tax details are waiting to share"
    } catch(error: Exception) { if(error is CancellationException) throw error; if(same()) "Saved on this phone · Workspace not updated: ${error.message}" else "Account changed. Saved records were kept." }
}
suspend fun DriverRepository.askTaxCoach(text: String,from: String,through: String): String {
    val question=text.trim(); require(question.length in 1..2000) { "Keep this question between 1 and 2,000 characters." }
    require(journal.coachOutbox.size<50) { "Your saved questions are waiting to sync. Connect your workspace before adding more." }
    val user=CoachMessage(role="user",text=question)
    val reply=if(reputationQuery(question)) LocalCoachReply(CoachMessage(role="assistant",text=reputationAnswer(question,journal.reputationState),engine="local-record-rules"),journal.coachMilestones)
        else localCoachAnswer(question,journal,from,through)
    val pending=CoachPendingMessage(user.id,question,from,through,CoachPreferences.from(journal.goals),reply.message.id)
    update { it.copy(coachMessages=it.coachMessages+listOf(user,reply.message),coachOutbox=it.coachOutbox+pending,coachMilestones=reply.milestones) }
    return syncTaxCoach(from,through)
}
suspend fun DriverRepository.saveTaxIntake(intake: CoachIntake,from: String,through: String): String {
    require(intake.taxYear==null || intake.taxYear in 1900..9999) { "Enter a valid tax year." }
    require(intake.jurisdiction==null || intake.jurisdiction.length in 2..80 && intake.jurisdiction.matches(Regex("[\\p{L} .,'-]+"))) { "Use a state or country name, without account or taxpayer numbers." }
    require(intake.businessType in listOf(null,"unsure","sole-proprietor","single-member-llc","partnership","corporation"))
    update { it.copy(coachIntake=intake,coachIntakeMutationId=uuid()) }
    return syncTaxCoach(from,through)
}

@Serializable data class OfficeCoordinate(val latitude: Double,val longitude: Double) {
    val valid get()=latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0
    fun milesTo(other: OfficeCoordinate): Double {
        val rad=PI/180; val a=sin((other.latitude-latitude)*rad/2).pow(2)+cos(latitude*rad)*cos(other.latitude*rad)*sin((other.longitude-longitude)*rad/2).pow(2)
        return 3958.7613*2*atan2(sqrt(a.coerceIn(0.0,1.0)),sqrt(max(0.0,1-a)))
    }
}
@Serializable data class OfficeContact(val phone: String = "",val hours: String = "",val available24x7: Boolean = false,val appointmentURL: String = "") {
    val callURL: String? get() { val digits=phone.filter { it in '0'..'9' }; return if(phone.matches(Regex("\\+?[0-9 () .-]+")) && digits.length in 7..15) "tel:"+(if(phone.startsWith('+')) "+" else "")+digits else null }
    val bookingURL get()=publicOfficeURL(appointmentURL)
    val shows24x7 get()=available24x7 && callURL!=null
}
fun publicOfficeURL(raw: String): String? = runCatching {
    val url=URI(raw);val host=url.host?.lowercase(Locale.US) ?: return null
    if(url.scheme=="https" && url.userInfo==null && url.port==-1 && host.contains('.') && !host.matches(Regex("[0-9.]+")) && !host.endsWith(".local") && !host.endsWith(".internal") && !host.endsWith(".localhost")) raw else null
}.getOrNull()
@Serializable data class DirectoryOffice(val id: String,val name: String,val address: String,val city: String,val state: String,val postalCode: String,
    val latitude: Double,val longitude: Double,val phone: String = "",val hours: String = "",val available24x7: Boolean = false,val appointmentURL: String = "",val exteriorImageURL: String? = null) {
    val coordinate get()=OfficeCoordinate(latitude,longitude)
    val contact get()=OfficeContact(phone,hours,available24x7,appointmentURL)
    val fullAddress get()="$address, $city, $state $postalCode"
}
@Serializable data class OfficeDirectory(val version: Int,val updatedAt: String,val support: OfficeContact = OfficeContact(),val offices: List<DirectoryOffice> = emptyList()) {
    fun ranked(near: OfficeCoordinate?): List<DirectoryOffice> {
        require(version==1 && offices.size<=10_000)
        return offices.filter { it.id.isNotBlank() && it.name.isNotBlank() && it.address.isNotBlank() && it.coordinate.valid }.distinctBy { it.id }
            .sortedWith(compareBy<DirectoryOffice> { if(near?.valid==true) near.milesTo(it.coordinate) else 0.0 }.thenBy { it.name.lowercase(Locale.US) }.thenBy { it.id })
    }
}

data class LocalCoachReply(val message: CoachMessage,val milestones: List<CoachMilestone>)
private fun profileMoney(cents: Long) = NumberFormat.getCurrencyInstance(Locale.US).format(cents/100.0)
private fun Expense.needsProfileReview() = classification!="personal" && (classification=="unclassified" || receiptId==null ||
    classification=="business" && (businessPurpose.isNullOrBlank() || category=="meals" && mealContext.isNullOrBlank() || businessUsePercent==0))
private val coachSources = listOf(
    CoachSource("irs-gig-work","IRS: Manage taxes for your gig work","https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work"),
    CoachSource("irs-recordkeeping","IRS: Recordkeeping","https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping"),
    CoachSource("irs-business-car","IRS: Business use of car","https://www.irs.gov/taxtopics/tc510"),
    CoachSource("irs-publication-463","IRS: Publication 463 — check the applicable tax year","https://www.irs.gov/publications/p463"),
    CoachSource("irs-estimated-taxes","IRS: Estimated taxes","https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes"))
/** Deterministic, record-based guidance. Never adds trip fares to payout entries or infers tax liability. */
fun localCoachAnswer(query: String,journal: Journal,from: String,through: String): LocalCoachReply {
    val valid=runCatching { LocalDate.parse(from); LocalDate.parse(through); from<=through }.getOrDefault(false)
    if(!valid) return LocalCoachReply(CoachMessage(role="assistant",text="Choose a valid record range using yyyy-MM-dd dates, with From on or before Through. No records were analyzed.",engine="local-record-rules",recordIds=emptyList()),emptyList())
    val records=journal.visible.map { it.record }.filter { it.date in from..through }
    val supported=records.filter { when(it.kind) { "income" -> it.income().currency=="USD"; "expense" -> it.expense().currency=="USD"; else -> true } }
    val trips=records.filter { it.kind=="trip" }
    val business=trips.filter { it.trip().classification=="business" && it.trip().endedAt!=null }
    val rides=business.map { RideProfit(it,journal.goals) }
    val priced=rides.filter { it.net!=null && !it.record.trip().hasGaps }.sortedWith(compareByDescending<RideProfit> { it.net }.thenBy { it.record.id })
    val losses=priced.filter { it.net!!<0 }.sortedBy { it.net }
    val expenses=records.filter { it.kind=="expense" && it.expense().classification!="personal" }
    val expenseReview=expenses.filter { it.expense().needsProfileReview() }
    val tripReview=trips.filter { r -> val t=r.trip(); t.classification=="unclassified" || t.classification=="business" && (t.hasGaps || t.endedAt==null || t.purpose.isBlank()) }
    val incomplete=rides.filter { it.net==null || it.record.trip().hasGaps }
    val intake=journal.coachIntake
    val work=intake.businessType?.trim().orEmpty(); val jurisdiction=intake.jurisdiction?.trim().orEmpty()
    val milestones=listOf(
        CoachMilestone("tax-year","Confirm tax year",if(intake.taxYear!=null) "Tax year ${intake.taxYear} is recorded. The displayed record range remains $from through $through." else "Choose the tax year before applying year-specific rules, rates, or deadlines.",if(intake.taxYear?.let { it in 1900..2200 }==true) "done" else "todo"),
        CoachMilestone("jurisdiction","Confirm tax jurisdiction",if(jurisdiction.isBlank()) "Add the country and relevant state or local jurisdiction. The linked IRS guidance covers U.S. federal taxes." else "Recorded jurisdiction: $jurisdiction. Relevant local rules still require review.",if(jurisdiction.isBlank()) "todo" else "done"),
        CoachMilestone("work-status","Confirm work and business status",if(work.isBlank() || work in listOf("unsure","unknown","not sure")) "Confirm employee, independent contractor, or other business arrangement." else "Recorded work or business status: $work.",if(work.isBlank() || work in listOf("unsure","unknown","not sure")) "todo" else "done"),
        CoachMilestone("trip-records","Review trip records",if(trips.isEmpty()) "No trips are saved in this range. Add applicable business driving records or confirm none are needed." else "${tripReview.size} trip records need classification, business purpose, completion, or GPS-gap review. This checks saved fields only.",if(trips.isNotEmpty() && tripReview.isEmpty()) "done" else "todo",tripReview.map { it.id }),
        CoachMilestone("job-economics","Complete job economics",if(rides.isEmpty()) "No completed business trips are available to compare." else "${incomplete.size} completed business trips need fare, explicit fees, an operating vehicle-cost estimate, or mileage review.",if(rides.isNotEmpty() && incomplete.isEmpty()) "done" else "todo",incomplete.map { it.record.id }),
        CoachMilestone("expense-evidence","Review expense evidence",if(expenses.isEmpty()) "No business or unclassified expenses are saved in this range. Add applicable records or confirm none are needed." else "${expenseReview.size} expenses have review prompts. Add available evidence and purpose; meals also need participants or travel context. A completed record does not establish deductibility.",if(expenses.isNotEmpty() && expenseReview.isEmpty()) "done" else "todo",expenseReview.map { it.id }),
        CoachMilestone("income-reconciliation","Reconcile income and tax forms","Compare saved income with platform statements, cash income, and applicable W-2 or 1099 forms. Documents not added here may exist elsewhere. Reconciliation and form receipt are not tracked here.",recordIds=records.filter { it.kind=="income" }.map { it.id }),
        CoachMilestone("vehicle-method","Review vehicle expense method","Confirm vehicle ownership or lease, first business-use year, previous methods, total and business miles, and costs before comparing tax methods. The operating cost goal is not an IRS mileage rate.",recordIds=trips.map { it.id }),
        CoachMilestone("estimated-payment-review","Prepare estimated-payment review","Gather the prior return, projected household income, withholding, payments, deductions, and credits for the applicable worksheet. Saving toward a goal does not record a tax payment."),
        CoachMilestone("return-review","Review filing with your preparer","Tax-return preparation, submission, acceptance, and payment confirmation are not established by this checklist or chat."))
    val totals=insights(supported,journal.goals,from,through)
    val income=totals.sumOf { it.income }; val spending=totals.sumOf { it.expenses }
    val tripFares=business.sumOf { if(it.trip().rideRole=="reposition") 0L else it.trip().earningsCents?.toLong() ?: 0L }
    val balance="${if(supported.none { it.kind=="income" }) "No USD income entries are saved in this range." else "Saved income entries total ${profileMoney(income)}."} Business-classified expense shares total ${profileMoney(spending)}, leaving a recorded operating balance of ${profileMoney(income-spending)}. This is saved income minus those expense shares, before tax review. Separately, completed business trips contain ${profileMoney(tripFares)} in known fare entries. Trip fares are not added to saved income because a payout may already include them. Vehicle-cost estimates are not subtracted again from the operating balance."
    val flags=mutableListOf<String>()
    rides.count { it.fare==null }.takeIf { it>0 }?.let { flags+="$it missing fares" }
    rides.count { it.fees==null }.takeIf { it>0 }?.let { flags+="$it unknown platform fees" }
    rides.count { it.vehicle==null }.takeIf { it>0 }?.let { flags+="$it without a valid operating vehicle-cost estimate" }
    trips.count { it.trip().classification=="business" && it.trip().hasGaps }.takeIf { it>0 }?.let { flags+="$it business trips with GPS gaps" }
    trips.count { it.trip().classification=="business" && it.trip().endedAt==null }.takeIf { it>0 }?.let { flags+="$it unfinished business trips" }
    trips.count { it.trip().classification=="unclassified" }.takeIf { it>0 }?.let { flags+="$it unclassified trips" }
    val limits=(if(flags.isEmpty()) "No missing fare, fee, vehicle-cost, completion, classification, or GPS flags were found in these saved trip fields." else "Review: ${flags.joinToString("; ")}. Jobs with unknown economics or flagged GPS gaps are excluded from net rankings.")+" Recorded trip time can include waiting inside a trip; waiting, idle time, and driving outside saved trips are not fully measured. Hourly figures use recorded trip time only. These operating estimates do not establish taxable income, deductions, or tax owed."
    fun rideLine(ride: RideProfit)="• ${ride.record.title} · ${ride.record.date} · ${ride.record.trip().platform ?: "Platform not recorded"}: ${profileMoney(ride.net!!.toLong())} estimated net, ${profileNumber(ride.miles)} mi, ${profileNumber(ride.minutes)} min"
    val best=if(priced.isEmpty()) "No individual trip can be ranked yet. Complete fare, explicit fees, and a vehicle-cost estimate, and review any GPS gaps." else "Best individual recorded trips by estimated trip net:\n${priced.take(5).joinToString("\n",transform=::rideLine)}\nThis ranks the saved sample; it does not predict future offers."
    val loss=if(losses.isEmpty()) if(priced.isEmpty()) "The records do not yet establish which trips lost money; no completed business trip has all required economics and reviewed mileage." else "No negative estimated trip net appears among the ${priced.size} fully priced business trips without flagged GPS gaps. Incomplete records and time outside recorded trips can change the overall result." else "${losses.size} recorded business trips have negative estimated trip net:\n${losses.take(5).joinToString("\n",transform=::rideLine)}\nTrip net uses recorded fare minus recorded platform fees and your estimated vehicle cost. It excludes other saved expenses and unrecorded work."
    val question=normalizedProfileText(query)
    fun asks(vararg words: String)=words.any { question.contains(it) }
    val tax=asks("tax","irs","deduct","1099","w 2","filing","filed","return","mileage rate")
    val missing=asks("missing","document","receipt","checklist","prepare","prep","review","gap")
    val paragraphs=mutableListOf("Records for $from through $through.")
    var evidence=records.map { it.id }
    when {
        tax -> {
            paragraphs+=balance
            paragraphs+=if(intake.taxYear==null || jurisdiction.isBlank() || work.isBlank()) "Before applying tax rules, confirm the tax year, country and state/local jurisdiction, and employee, independent-contractor, or other business status." else "Recorded intake: tax year ${intake.taxYear}, $jurisdiction, $work. The linked IRS guidance covers U.S. federal taxes; use the guidance for the applicable year and review local requirements."
            paragraphs+="IRS guidance calls for reporting gig income even without a 1099 and keeping supporting records. Review business purpose, evidence, and any personal use before assessing expenses. Vehicle-method review needs ownership or lease and prior-method history; your operating cost estimate is not an IRS mileage rate. For meals, add the receipt or supporting evidence, business purpose, and participants or travel context for review."
            paragraphs+="Estimated-tax planning also needs projected household income, withholding, payments, deductions, credits, and the applicable worksheet. This chat does not calculate tax liability or approve deductions, and it has not submitted a return or payment. It cannot confirm filing or payment status."
            if(missing) paragraphs+="Next preparation steps:\n"+milestones.filter { it.status=="todo" }.take(6).joinToString("\n") { "• ${it.title}: ${it.detail}" }
        }
        missing -> { paragraphs+="${records.size} records are saved in this range. ${expenseReview.size} expenses have review prompts. $limits"; paragraphs+="Next preparation steps:\n"+milestones.filter { it.status=="todo" }.take(6).joinToString("\n") { "• ${it.title}: ${it.detail}" } }
        asks("losing","loosing","lose money","loss","negative","unprofitable","lost money") -> { paragraphs+=loss; paragraphs+=limits; evidence=losses.take(5).map { it.record.id } }
        asks("goal","target","progress","saving") -> {
            val lines=mutableListOf<String>()
            for((label,target,first) in listOf(Triple("Daily goal",journal.goals.dailyNetCents,through),Triple("Weekly target reference",journal.goals.weeklyNetCents,maxOf(from,LocalDate.parse(through).minusDays(6).toString())))) {
                if(target==null || target<=0) continue
                val subset=priced.filter { it.record.date>=first }; val net=subset.sumOf { it.net!!.toLong() }
                val all=trips.filter { it.date>=first && it.trip().classification!="personal" }
                lines+=when { subset.isEmpty() -> "$label: progress unavailable; no eligible, fully priced trips are recorded in $first through $through. Your target is ${profileMoney(target.toLong())}."
                    all.size>subset.size -> "$label: ${profileMoney(net)} recorded estimated trip net is the known portion against your ${profileMoney(target.toLong())} target. Other trip records need review; full progress and remaining earnings are unknown."
                    else -> "$label: ${profileMoney(net)} recorded estimated trip net against your ${profileMoney(target.toLong())} target. This view covers $first through $through." }
            }
            journal.goals.targetHourlyCents?.takeIf { it>0 }?.let { target ->
                val minutes=priced.sumOf { it.minutes }
                lines+=if(priced.isNotEmpty() && priced.all { it.minutes>=1 } && minutes>=1) "Recorded trip-hour rate: ${profileMoney((priced.sumOf { it.net!!.toLong() }/(minutes/60)).roundToLong())}/hour against your ${profileMoney(target.toLong())}/hour target; full shift and idle hours are not known." else "Hourly goal comparison unavailable. Each contributing fully priced trip needs at least one recorded minute before comparing your hourly target."
            }
            if(lines.isEmpty()) lines+="Set a daily net, weekly net, or hourly operating target to compare with your recorded trips."
            lines+="Progress uses fully priced trips without flagged GPS gaps and excludes unrecorded work. Savings contributions and account balances are not recorded in these goal fields; I cannot infer money saved or taxes paid."
            paragraphs+=lines.joinToString("\n"); paragraphs+=limits; evidence=priced.map { it.record.id }
        }
        asks("waiting","wait time","idle","downtime","online time","shift time") -> paragraphs+="Completed business trips contain ${profileNumber(rides.sumOf { it.minutes })} recorded minutes. The records supplied to this coach do not separate driving from waiting inside those trips or capture all between-job idle and online time. I cannot determine total shift hours, idle cost, or a true shift hourly rate from these records. Record the missing work and waiting periods before comparing full shifts."
        asks("area","neighborhood","zone","where","location","start hour","start hour","time of day","when","morning","evening","hour","platform","uber","lyft","doordash","instacart","spark","amazon") -> {
            val label=if(asks("area","neighborhood","zone","where","location")) "work area" else if(asks("start hour","time of day","when","morning","evening","hour")) "recorded start hour" else "platform"
            val groups=rides.groupBy { ride -> when(label) { "work area" -> ride.record.trip().workArea?.takeIf { it.isNotBlank() } ?: "Area not recorded"; "recorded start hour" -> runCatching { Instant.parse(ride.record.trip().startedAt).atZone(ZoneId.of(ride.record.trip().timeZoneId ?: "UTC")).hour.toString().padStart(2,'0')+":00" }.getOrDefault("Hour not recorded"); else -> ride.record.trip().platform?.takeIf { it.isNotBlank() } ?: "Platform not recorded" } }
            paragraphs+=if(groups.isEmpty()) "No completed business trips are saved for a $label summary." else "Recorded trips by $label:\n"+groups.entries.sortedWith(compareByDescending<Map.Entry<String,List<RideProfit>>> { it.value.all { r->r.net!=null && !r.record.trip().hasGaps } }.thenByDescending { it.value.sumOf { r->r.net?.toLong() ?: 0L } }.thenBy { it.key }).take(8).joinToString("\n") { (name,jobs) ->
                val complete=jobs.filter { it.net!=null && !it.record.trip().hasGaps };val net=complete.sumOf { it.net!!.toLong() };val minutes=jobs.sumOf { it.minutes }
                "• $name: ${jobs.size} trips, ${complete.size} fully priced, "+(if(complete.size==jobs.size) "${profileMoney(net)} estimated net" else "${profileMoney(net)} known subtotal; incomplete")+(if(complete.size==jobs.size && jobs.all { it.minutes>=1 } && minutes>=1) ", ${profileMoney((net/(minutes/60)).roundToLong())}/recorded trip hour" else "")
            }+"\nThese are saved observations, with no adjustment for sample size or future demand."
            paragraphs+=limits
        }
        asks("best","top","highest","most profitable","most money") -> { paragraphs+=best;paragraphs+=limits;evidence=priced.take(5).map { it.record.id } }
        else -> { paragraphs+=balance; if(rides.isNotEmpty()) { paragraphs+=best; paragraphs+=loss }; paragraphs+=limits }
    }
    if(records.size>supported.size) paragraphs+="${records.size-supported.size} income or expense records use another currency and are excluded from USD totals; no currency conversion was assumed."
    return LocalCoachReply(CoachMessage(role="assistant",text=paragraphs.joinToString("\n\n"),engine="local-record-rules",sources=if(tax || missing) coachSources else null,recordIds=evidence),milestones)
}
