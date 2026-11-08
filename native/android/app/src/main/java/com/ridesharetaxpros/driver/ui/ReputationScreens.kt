package com.ridesharetaxpros.driver.ui

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

private data class ProfileDeletion(val id: String,val review: Boolean,val scope: String)
@Composable fun ReputationScreen(repo: DriverRepository,navigate: (String)->Unit) {
    var platform by rememberSaveable { mutableStateOf("all") }
    var guidance by rememberSaveable { mutableStateOf(false) }
    var status by remember(repo.scope) { mutableStateOf("Saved on this phone · Connect to share with your tax team") }
    var busy by remember { mutableStateOf(false) }
    var deletion by remember { mutableStateOf<ProfileDeletion?>(null) }
    val scope=rememberCoroutineScope()
    suspend fun refresh() { busy=true; try { status=repo.syncProfileReputation() } finally { busy=false } }
    LaunchedEffect(repo.scope) { platform="all";deletion=null;refresh() }
    val state=repo.journal.reputationState
    val selected=platform.takeUnless { it=="all" }
    Panel {
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) { Icon(Icons.Default.Star,null,tint=ExpenseColor);Text("Your ratings & feedback",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold) }
        Text("Save the scores and customer feedback you see in your work apps. Each entry is a personal record; apps do not send ratings here automatically.",color=Muted,style=MaterialTheme.typography.bodySmall)
        Text(status,color=Route,style=MaterialTheme.typography.labelSmall,modifier=Modifier.testTag("reputation.status"))
        if(repo.connection!=null) TextButton(enabled=!busy,onClick={scope.launch { refresh() }}) { Text(if(busy) "Sharing your entries…" else "Sync my personal entries") }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            OutlinedButton(enabled=repo.storageReady,onClick={navigate("Add rating")},modifier=Modifier.weight(1f).testTag("reputation.addRating")) { Text("☆ Add rating") }
            OutlinedButton(enabled=repo.storageReady,onClick={navigate("Add review")},modifier=Modifier.weight(1f).testTag("reputation.addReview")) { Text("Add review") }
        }
    }
    Panel {
        Choice("Platform",platform,linkedMapOf("all" to "All platforms").apply { putAll(reputationOptions(state)) }) {platform=it}
        Text("Trends compare your snapshots for the same platform and rating scale. Review count and feedback tags are entered by you.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    for(summary in reputationSummaries(state,selected)) Panel(summary.platformName) {
        summary.latest?.let { latest ->
            Text("${profileNumber(latest.score)} / ${profileNumber(latest.scale)}",style=MaterialTheme.typography.headlineSmall,color=ExpenseColor,fontWeight=FontWeight.Bold)
            Text("Snapshot · ${profileDay(latest.recordedAt)}",color=Muted,style=MaterialTheme.typography.labelMedium)
            summary.change?.let { change -> Text("${if(change>0) "+" else ""}${profileNumber(change)} ${if(latest.scale==5.0) "stars" else "percentage points"} since ${profileDay(summary.previous!!.recordedAt)}",color=if(change>0) Income else if(change<0) Pink else Route) }
                ?: Text("Add another snapshot on this scale to compare changes.",color=Muted,style=MaterialTheme.typography.bodySmall)
        }
        Text("${summary.ratings.size} rating snapshots · ${summary.reviews.size} saved reviews",style=MaterialTheme.typography.labelMedium)
        val feedback=summary.reviews.filter { it.sentiment in listOf("positive","mixed","negative") }
        for(topic in feedback.flatMap { it.topics.ifEmpty { listOf("other") } }.distinct()) {
            val positive=feedback.filter { it.sentiment=="positive" && topic in it.topics.ifEmpty { listOf("other") } }
            val improvement=feedback.filter { it.sentiment in listOf("mixed","negative") && topic in it.topics.ifEmpty { listOf("other") } }
            if(positive.isNotEmpty()) Text("✓ ${topic.replaceFirstChar { it.uppercase() }} · ${positive.size} positive tagged reviews",color=Income,style=MaterialTheme.typography.bodySmall)
            if(improvement.isNotEmpty()) {
                Text("${topic.replaceFirstChar { it.uppercase() }}",color=ExpenseColor,fontWeight=FontWeight.SemiBold)
                Text(reputationImprovement(topic),style=MaterialTheme.typography.bodySmall)
                Text("Based on ${improvement.size} of your tagged reviews.",color=Muted,style=MaterialTheme.typography.labelSmall)
            }
        }
    }
    Panel {
        TextButton(onClick={guidance=!guidance},modifier=Modifier.testTag("reputation.guide")) {Text(if(guidance) "How can I improve?  −" else "How can I improve?  +")}
        if(guidance) {
            SelectionContainer { Text(reputationAnswer("How can I improve my ratings and reviews?",state,selected),style=MaterialTheme.typography.bodySmall) }
            Text("Guidance uses your saved feedback and manual tags. It is not a provider policy, eligibility verdict or promise that your score will change.",color=Muted,style=MaterialTheme.typography.labelSmall)
        }
    }
    Text("Rating history",color=Muted,style=MaterialTheme.typography.labelLarge)
    val ratings=state.ratings.withIndex().filter { !it.value.deleted && (selected==null || it.value.platformID==selected) }.sortedWith(compareByDescending<IndexedValue<ReputationRating>> {java.time.Instant.parse(it.value.recordedAt)}.thenByDescending {it.index}).map {it.value}
    if(ratings.isEmpty()) Panel {Text("No rating snapshots for this selection yet.",color=Muted,style=MaterialTheme.typography.bodySmall)}
    ratings.forEach { rating -> Panel(rating.platformName) {
        Text("${profileNumber(rating.score)} / ${profileNumber(rating.scale)}",color=ExpenseColor,fontWeight=FontWeight.Bold)
        Text(profileDay(rating.recordedAt),color=Muted,style=MaterialTheme.typography.labelMedium)
        rating.reviewCount?.let {Text("Review count entered: $it",style=MaterialTheme.typography.bodySmall)}
        if(rating.notes.isNotBlank()) Text(rating.notes,style=MaterialTheme.typography.bodySmall)
        TextButton(onClick={deletion=ProfileDeletion(rating.id,false,repo.scope)}) {Text("Delete snapshot",color=Pink)}
    } }
    Text("Review history",color=Muted,style=MaterialTheme.typography.labelLarge)
    val reviews=state.reviews.withIndex().filter { !it.value.deleted && (selected==null || it.value.platformID==selected) }.sortedWith(compareByDescending<IndexedValue<ReputationReview>> {java.time.Instant.parse(it.value.recordedAt)}.thenByDescending {it.index}).map {it.value}
    if(reviews.isEmpty()) Panel {Text("No saved reviews for this selection yet.",color=Muted,style=MaterialTheme.typography.bodySmall)}
    reviews.forEach { review -> Panel(review.platformName) {
        Text(review.sentiment.replaceFirstChar {it.uppercase()},color=if(review.sentiment=="positive") Income else ExpenseColor,style=MaterialTheme.typography.labelMedium)
        Text(profileDay(review.recordedAt),color=Muted,style=MaterialTheme.typography.labelMedium)
        SelectionContainer {Text(review.text,style=MaterialTheme.typography.bodySmall)}
        if(review.topics.isNotEmpty()) Text("Your tags: "+review.topics.joinToString {it.replaceFirstChar {ch->ch.uppercase()}},color=Route,style=MaterialTheme.typography.labelMedium)
        TextButton(onClick={deletion=ProfileDeletion(review.id,true,repo.scope)}) {Text("Delete review",color=Pink)}
    } }
    deletion?.let { item -> AlertDialog(onDismissRequest={deletion=null},title={Text("Delete this saved entry?")},text={Text("This removes your personal copy from this history and, when connected, from this client account. It does not remove a review or rating in any gig app.")},confirmButton={TextButton(onClick={deletion=null;if(item.scope==repo.scope) runCatching {repo.saveProfileMutation(ReputationMutation(action=if(item.review) "deleteReview" else "deleteRating",id=item.id));scope.launch {refresh()} }.onFailure {repo.failure=it.message}}) {Text("Delete entry",color=Pink)}},dismissButton={TextButton(onClick={deletion=null}) {Text("Cancel")}}) }
}

@Composable fun ReputationEntryScreen(repo: DriverRepository,kind: String,done: ()->Unit) {
    val context=LocalContext.current; val loadedScope=remember {repo.scope}; val rating=kind!="review"
    val recordedTime=remember {java.time.LocalTime.now()}
    var platform by rememberSaveable {mutableStateOf(reputationPlatforms.keys.first())}
    var customName by rememberSaveable {mutableStateOf("")}; var date by rememberSaveable {mutableStateOf(today())}
    var score by rememberSaveable {mutableStateOf("")};var scale by rememberSaveable {mutableStateOf("5")};var count by rememberSaveable {mutableStateOf("")}
    var notes by rememberSaveable {mutableStateOf("")};var text by rememberSaveable {mutableStateOf("")};var sentiment by rememberSaveable {mutableStateOf("unreviewed")}
    var topics by remember {mutableStateOf(setOf<String>())}; var error by remember {mutableStateOf<String?>(null)}
    val options=reputationOptions(repo.journal.reputationState)
    Panel("Where you saw it") {
        Choice("Platform",platform,options+mapOf("__new__" to "Another app or client")) {platform=it}
        if(platform=="__new__") Field("App or client name",customName,{customName=it})
        OutlinedButton(onClick={val current=LocalDate.parse(date);DatePickerDialog(context,{_,year,month,day->date=LocalDate.of(year,month+1,day).toString()},current.year,current.monthValue-1,current.dayOfMonth).apply {datePicker.maxDate=System.currentTimeMillis()}.show()},modifier=Modifier.fillMaxWidth()) {Text("Recorded on · $date")}
        Text("Enter only information you choose to keep. Leave customer names, addresses and other private identifiers out of review text.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    if(rating) Panel("Rating snapshot") {
        Choice("Rating scale",scale,linkedMapOf("5" to "Stars / 5","100" to "Percent / 100")) {scale=it}
        Field("Score · 0 to $scale",score,{score=it})
        Field("Review count · optional",count,{count=it})
        Field("Notes · optional",notes,{notes=it},multiline=true)
        Text("Keep the scale shown by that app. Each save adds a dated snapshot; changing the scale does not convert a previous score.",color=Muted,style=MaterialTheme.typography.bodySmall)
    } else {
        Panel("Review you received") {Field("Review text",text,{text=it},multiline=true);Choice("Your tone label",sentiment,ReputationReview.sentiments.associateWith {it.replaceFirstChar {ch->ch.uppercase()}}) {sentiment=it}}
        Panel("Your feedback tags") {
            ReputationReview.supportedTopics.forEach {topic->Toggle(topic.replaceFirstChar {it.uppercase()},topic in topics) {topics=if(it) topics+topic else topics-topic}}
            Text("Choose tags yourself. Improvement guidance uses these labels and the saved reviews behind them; no automatic sentiment score is assigned.",color=Muted,style=MaterialTheme.typography.bodySmall)
        }
    }
    error?.let {Text(it,color=Pink,modifier=Modifier.testTag("reputation.error"))}
    Button(enabled=repo.storageReady,onClick={runCatching {
        require(loadedScope==repo.scope) {"Your account changed. Reopen this form before saving."}
        val name=if(platform=="__new__") customName.trim() else options[platform].orEmpty()
        require(name.length in 1..80) {"Use an app or client name between 1 and 80 characters."}
        val id=if(platform=="__new__") customReputationPlatformID(name) else platform
        val recorded=LocalDate.parse(date).atTime(recordedTime).atZone(java.time.ZoneId.systemDefault()).toInstant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString()
        require(date<=today()) {"Choose today or an earlier date."}
        val mutation=if(rating) {
            val value=score.trim().replace(',','.').toDoubleOrNull() ?: error("Enter a finite score from zero through the selected scale.")
            val reviews=count.trim().takeIf {it.isNotBlank()}?.let {it.toIntOrNull() ?: error("Review count must be a whole number, or left blank.")}
            ReputationMutation(action="addRating",rating=ReputationRating(platformID=id,platformName=name,recordedAt=recorded,score=value,scale=scale.toDouble(),reviewCount=reviews,notes=notes).validated())
        } else ReputationMutation(action="addReview",review=ReputationReview(platformID=id,platformName=name,recordedAt=recorded,text=text,sentiment=sentiment,topics=ReputationReview.supportedTopics.filter {it in topics}).validated())
        repo.saveProfileMutation(mutation); repo.run {repo.syncProfileReputation()}; done()
    }.onFailure {error=it.message}},modifier=Modifier.fillMaxWidth().testTag(if(rating) "reputation.saveRating" else "reputation.saveReview")) {Text(if(rating) "Save rating snapshot" else "Save review")}
    Text(if(repo.connection==null) "Saved privately on this phone. You can choose whether to copy it when connecting an account." else "Saved on this phone first, then shared with this client account and your tax team when available.",color=Muted,style=MaterialTheme.typography.bodySmall)
    TextButton(onClick=done,modifier=Modifier.fillMaxWidth()) {Text("Cancel")}
}
