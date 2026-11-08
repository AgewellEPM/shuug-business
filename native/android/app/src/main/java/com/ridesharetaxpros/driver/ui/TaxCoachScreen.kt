package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.net.URI
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable fun TaxCoachScreen(repo: DriverRepository,navigate: (String)->Unit) {
    var draft by rememberSaveable(repo.scope) {mutableStateOf("")}
    var period by rememberSaveable {mutableStateOf("30")}
    var status by remember(repo.scope) {mutableStateOf("On this phone · Connect to share with your firm")}
    var busy by remember {mutableStateOf(false)}
    var milestonesOpen by rememberSaveable {mutableStateOf(false)}
    val scope=rememberCoroutineScope()
    val through=today()
    val from=if(period=="0") LocalDate.now().withDayOfYear(1).toString() else LocalDate.now().minusDays(period.toLong()-1).toString()
    fun ask(text: String) {
        val question=text.trim(); if(busy || question.isEmpty() || question.length>2000) return
        busy=true; draft=""
        scope.launch {
            try {status=repo.askTaxCoach(question,from,through)}
            catch(error: Exception) {if(error is CancellationException) throw error;repo.failure=error.message;if(draft.isBlank()) draft=question}
            finally {busy=false}
        }
    }
    LaunchedEffect(repo.scope,period) {
        while(true) {
            status=repo.syncTaxCoach(from,through)
            delay(20_000)
        }
    }
    Panel {
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {Icon(Icons.Default.Chat,null,tint=Route);Text("Your records. Your next step.",fontWeight=FontWeight.Bold,color=Route)}
        Text(status,color=Muted,style=MaterialTheme.typography.labelMedium,modifier=Modifier.testTag("coach.status"))
        if(busy) LinearProgressIndicator(Modifier.fillMaxWidth(),color=Route)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            if(repo.connection==null) TextButton(onClick={navigate("Account")}) {Text("Connect my client account")}
            TextButton(onClick={navigate("Tax details")},modifier=Modifier.testTag("coach.intake")) {Text("Tax details")}
            TextButton(onClick={navigate("Goals")}) {Text("Goals & costs")}
        }
        Row(Modifier.fillMaxWidth().background(Color(0xFF20232A),RoundedCornerShape(50)).padding(2.dp)) {
            linkedMapOf("7" to "7 days","30" to "30 days","90" to "90 days","0" to "This year").forEach { (key,label)->
                Box(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if(period==key) Color(0xFF5C5F67) else Color.Transparent)
                    .selectable(period==key,role=Role.Tab,onClick={period=key}).padding(vertical=7.dp),contentAlignment=Alignment.Center) {Text(label,style=MaterialTheme.typography.labelMedium)}
            }
        }
        Text("Financial records: $from through $through",color=Muted,style=MaterialTheme.typography.labelSmall)
        TextButton(onClick={navigate("Ratings & reviews")}) {Text("Your ratings & reviews")}
    }
    if(repo.journal.coachMessages.isEmpty()) Panel("Where am I losing money?") {
        Text("Ask about your jobs, platforms, costs, tax-prep records or milestones. Answers identify their source and what is still missing.",color=Muted)
        CoachPrompts(!busy,::ask)
    }
    if(repo.journal.coachMilestones.isNotEmpty()) Panel {
        TextButton(onClick={milestonesOpen=!milestonesOpen}) {Text(if(milestonesOpen) "Your next milestones  −" else "Your next milestones  +")}
        if(milestonesOpen) for(milestone in repo.journal.coachMilestones) {
            Text((if(milestone.status=="done") "✓ " else "○ ")+milestone.title,color=if(milestone.status=="done") Income else ExpenseColor,fontWeight=FontWeight.SemiBold)
            Text(milestone.detail,color=Muted,style=MaterialTheme.typography.bodySmall)
        }
    }
    val pendingIDs=repo.journal.coachOutbox.map {it.id}.toSet()
    for(message in repo.journal.coachMessages) Column(Modifier.fillMaxWidth()
        .background(if(message.role=="user") Purple.copy(alpha=.15f) else Panel,RoundedCornerShape(18.dp))
        .border(1.dp,(if(message.role=="user") Purple else Route).copy(alpha=.35f),RoundedCornerShape(18.dp)).padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(when(message.role) {"user"->"You";"staff"->"Your firm";else->"Shuug Guide"},color=if(message.role=="user") Link else Route,style=MaterialTheme.typography.labelMedium,fontWeight=FontWeight.Bold)
            Text(runCatching {java.time.Instant.parse(message.createdAt).atZone(java.time.ZoneId.systemDefault()).toLocalTime().withSecond(0).withNano(0).toString()}.getOrDefault(""),color=Muted,style=MaterialTheme.typography.labelSmall)
        }
        SelectionContainer {Text(message.text,modifier=Modifier.testTag("coach.message"))}
        if(message.role!="user") Text(when(message.engine) {"local-record-rules"->"Phone record analysis · Not shared yet";"phone-record-rules"->"Phone record analysis · Question shared";else->"Record-based guidance"},color=Muted,style=MaterialTheme.typography.labelSmall)
        else if(message.id in pendingIDs) Text("Saved on this phone · Sharing pending",color=ExpenseColor,style=MaterialTheme.typography.labelSmall)
        for(source in message.sources.orEmpty()) {
            val safe=runCatching {val uri=URI(source.url);uri.scheme=="https" && (uri.host=="irs.gov" || uri.host?.endsWith(".irs.gov")==true) && uri.userInfo==null}.getOrDefault(false)
            if(safe) TextButton(onClick={runCatching {repo.app.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(source.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}.onFailure {repo.failure="No browser could open this source."}}) {Text(source.title,color=Route)}
        }
        for(id in message.recordIds.orEmpty().take(3)) if(repo.journal.visible.any {it.record.id==id && it.record.kind=="trip"}) TextButton(onClick={navigate("Trip:$id")}) {Text("Open recorded job",color=Route)}
    }
    if(repo.journal.coachMessages.isNotEmpty()) CoachPrompts(!busy,::ask)
    Text("Recorded profit is not taxable income or tax owed. Confirm tax details and review documents with your firm. No return or payment is filed by chatting.",color=Muted,style=MaterialTheme.typography.labelSmall)
    if(draft.length>2000) Text("Keep this question under 2,000 characters.",color=ExpenseColor)
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(draft,{draft=it},label={Text("Ask about jobs, taxes or goals…")},modifier=Modifier.weight(1f).testTag("coach.question"),minLines=1,maxLines=5)
        FilledIconButton(enabled=!busy && repo.storageReady && draft.trim().length in 1..2000,onClick={ask(draft)},modifier=Modifier.size(48.dp).testTag("coach.send")) {Icon(Icons.Default.Send,"Send question")}
    }
    Text(if(repo.connection==null) "Phone-only · Choose whether to copy this chat when connecting" else "Sending shares this conversation and your chosen cost/goal assumptions with your firm’s workspace.",color=Muted,style=MaterialTheme.typography.labelSmall)
}
@Composable private fun CoachPrompts(enabled: Boolean,ask: (String)->Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        for(prompt in listOf("Which jobs lose money?","What pays me best?","What are my expenses?","What do I need for taxes?","How do I reach my goal?","How can I improve my ratings?")) TextButton(enabled=enabled,onClick={ask(prompt)},shape=RoundedCornerShape(50),colors=ButtonDefaults.textButtonColors(contentColor=Route),modifier=Modifier.background(Route.copy(alpha=.1f),RoundedCornerShape(50))) {Text(prompt,style=MaterialTheme.typography.labelMedium,fontWeight=FontWeight.SemiBold)}
    }
}

@Composable fun CoachIntakeScreen(repo: DriverRepository,done: ()->Unit) {
    val intake=repo.journal.coachIntake
    val loadedScope=remember {repo.scope}
    var year by rememberSaveable {mutableStateOf(intake.taxYear?.toString().orEmpty())}
    var jurisdiction by rememberSaveable {mutableStateOf(intake.jurisdiction.orEmpty())}
    var businessType by rememberSaveable {mutableStateOf(intake.businessType ?: "unsure")}
    var error by remember {mutableStateOf<String?>(null)};var saving by remember {mutableStateOf(false)}
    val scope=rememberCoroutineScope()
    Panel("Tax-prep details you confirm") {
        Field("Tax year",year,{year=it})
        Field("Federal / state / local jurisdiction",jurisdiction,{jurisdiction=it})
        Choice("Business arrangement",businessType,linkedMapOf("unsure" to "Not sure yet","sole-proprietor" to "Sole proprietor / contractor","single-member-llc" to "Single-member LLC","partnership" to "Partnership","corporation" to "Corporation")) {businessType=it}
        Text("These are your confirmed answers for preparation and review. Chat does not silently fill or change them.",color=Muted,style=MaterialTheme.typography.bodySmall)
    }
    Panel {Text("Upload requested tax documents through your client account. Keep passwords, verification codes, full Social Security numbers and bank credentials out of chat.",color=Muted,style=MaterialTheme.typography.bodySmall)}
    error?.let {Text(it,color=Pink)}
    Button(enabled=!saving && repo.storageReady,onClick={scope.launch {
        saving=true
        try {
            require(loadedScope==repo.scope) {"Your account changed. Reopen this form before saving."}
            val raw=year.trim(); val taxYear=raw.takeIf {it.isNotEmpty()}?.let {it.toIntOrNull() ?: throw IllegalArgumentException("Enter a valid tax year.")}
            val place=jurisdiction.trim().takeIf {it.isNotEmpty()}
            val through=today(); val from=LocalDate.now().minusDays(29).toString()
            repo.saveTaxIntake(CoachIntake(taxYear,place,businessType),from,through)
            done()
        } catch(failure: Exception) {if(failure is CancellationException) throw failure;error=failure.message} finally {saving=false}
    }},modifier=Modifier.fillMaxWidth().testTag("coach.saveIntake")) {Text(if(saving) "Saving…" else "Confirm & save")}
    TextButton(enabled=!saving,onClick=done,modifier=Modifier.fillMaxWidth()) {Text("Cancel")}
}
