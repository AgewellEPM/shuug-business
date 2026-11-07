package com.ridesharetaxpros.driver.ui

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.tracking.DriveService
import kotlinx.serialization.json.*

@Composable fun AccountScreen(repo: DriverRepository,onRewards: ()->Unit,onPrivacy: ()->Unit,onTracking: ()->Unit) {
    var address by remember {mutableStateOf("")};var email by remember {mutableStateOf("")};var password by remember {mutableStateOf("")};var transfer by remember {mutableStateOf(false)}
    var actionBusy by remember {mutableStateOf(false)};var signOut by remember {mutableStateOf(false)}
    Panel("Your workspace") {
        if(repo.connection==null) {
            Text("Offline records stay on this phone. Connect your invited client account to share records and receipts with the firm.")
            Field("Workspace HTTPS address",address,{address=it});Field("Client email",email,{email=it});Field("Password",password,{password=it},secret=true)
            OutlinedButton(onClick={repo.run {address=WorkspaceClient.discover() ?: "";if(address.isBlank()) repo.failure="The public workspace is not connected yet. Offline tracking is available."}}) {Text("Find firm workspace")}
            Button(enabled=!actionBusy,onClick={actionBusy=true;repo.run {try {repo.connect(address,email,password);password=""} finally {actionBusy=false}}}) {Text("Connect workspace")}
        } else {
            Text(repo.connection!!.session.account.name);Text(repo.connection!!.origin,color=Muted)
            Text("${repo.journal.entries.count {it.pendingMutationId!=null}} records awaiting sync · last synced ${repo.journal.lastSyncAt ?: "never"}")
            Button(enabled=!repo.busy,onClick={repo.run {repo.sync()}}) {Text(if(repo.busy) "Syncing…" else "Sync with firm")}
            OutlinedButton(onClick={transfer=true}) {Text("Copy offline guest records to this account")}
            TextButton(onClick={signOut=true}) {Text("Disconnect workspace")}
        }
    }
    repo.journal.entries.filter {it.conflict!=null}.forEach {entry->Panel("Sync conflict: ${entry.record.title}") {
        Text("Your edit and the workspace changed. Review before choosing which to keep.")
        Text("Phone: ${entry.record.body}",style=MaterialTheme.typography.bodySmall);Text("Workspace: ${entry.conflict!!.record.body}",style=MaterialTheme.typography.bodySmall)
        TextButton(onClick={repo.run {repo.resolve(entry.record.id,true)}}) {Text("Keep phone version")};TextButton(onClick={repo.run {repo.resolve(entry.record.id,false)}}) {Text("Use workspace version")}
    }}
    Panel("Driving assistance") {
        Text("Optional GPS monitoring uses a visible, persistent notification and battery. Start it while the app is open. Android or a force stop may interrupt tracking; review your trips for gaps.",color=Muted)
        Toggle("Detect drives & send trip alerts",repo.journal.assistance.automaticDrives) {enabled->repo.run {repo.update {it.copy(assistance=it.assistance.copy(automaticDrives=enabled))}}}
        Text("Movement prompts Start trip? A prolonged stop prompts End trip? Answer directly in the alert. Completed drives can be classified and earnings entered from follow-up alerts. Recording begins when you confirm; earlier miles need review.",color=Muted)
        Toggle("Remind me near purchases",repo.journal.assistance.placeReminders) {enabled->repo.run {repo.update {it.copy(assistance=it.assistance.copy(placeReminders=enabled))}}}
        Text("When enabled and monitoring, a nearby-place lookup sends a stopped location to the public OpenStreetMap Overpass service. It may identify gas, charging, food, repair, auto-parts or dealership locations. Coverage is incomplete. Nothing is posted without your review. © OpenStreetMap contributors.",color=Muted)
        Button(onClick=onTracking,enabled=repo.journal.assistance.automaticDrives || repo.journal.assistance.placeReminders || repo.journal.activeTripId!=null) {Text("Start or resume monitoring")}
        TextButton(onClick={repo.app.stopService(Intent(repo.app,DriveService::class.java))}) {Text("Pause location monitoring")}
        Text(repo.trackingStatus)
    }
    Button(onClick=onRewards,Modifier.fillMaxWidth()) {Text("Driver Rewards · $20 + points")}
    OutlinedButton(onClick={repo.run {shareBytes(repo,exportCSV(repo.journal).toByteArray(),"text/csv","driver-records.csv")}},Modifier.fillMaxWidth()) {Text("Export journal CSV")}
    TextButton(onClick=onPrivacy) {Text("Privacy & tracking details")}
    if(transfer) AlertDialog(onDismissRequest={transfer=false},title={Text("Copy guest records to this client?")},text={Text("Guest records, receipts and goals will be copied into ${repo.connection?.session?.account?.name}'s journal. They will be sent to the firm on your next sync. The local guest source remains recoverable.")},confirmButton={TextButton(onClick={transfer=false;repo.run {repo.transferGuest()}}) {Text("Copy records")}},dismissButton={TextButton(onClick={transfer=false}) {Text("Cancel")}})
    if(signOut) AlertDialog(onDismissRequest={signOut=false},title={Text("Disconnect this workspace?")},text={Text("The server session will be revoked. Unsynced account records remain separately on this phone; reconnect to sync them later.")},confirmButton={TextButton(onClick={signOut=false;repo.run {repo.disconnect()}}) {Text("Disconnect")}},dismissButton={TextButton(onClick={signOut=false}) {Text("Cancel")}})
}

@Composable fun ReferralScreen(repo: DriverRepository) {
    var code by remember {mutableStateOf("")};var choice by remember {mutableStateOf<JsonObject?>(null)};var busy by remember {mutableStateOf(false)}
    fun action(values: Map<String,String>?=null) {if(busy) return;busy=true;repo.run {try {repo.referralAction(values)} finally {busy=false}}}
    LaunchedEffect(repo.scope) {action()}
    Panel("Your network. Your rewards.") {
        Text("Earn $20 for each qualifying tax-prep referral—choose cash or tax-prep credit—plus 100 points. Every 500 points unlocks an extra $20 tax-prep credit.")
        Text("Rewards qualify after staff confirms you use our tax-prep services and your friend's first paid tax preparation is complete. Points never expire.",color=Muted)
    }
    if(repo.connection==null) Text("Connect your invited client account in Account to get your referral code and keep rewards together across phones.")
    repo.rewards?.let {state->
        val program=state["program"]!!.jsonObject;val points=state["points"]!!.jsonPrimitive.int;val milestone=program["milestonePoints"]!!.jsonPrimitive.int.coerceAtLeast(1)
        val personalCode=state["code"]!!.jsonPrimitive.content
        Panel("Your referral code") {Text(personalCode,style=MaterialTheme.typography.headlineMedium)
            Button(onClick={val text="I use Gig Tax Pros. Tell them I referred you with code $personalCode. "+state["shareUrl"]!!.jsonPrimitive.content
                repo.app.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text),"Share my referral").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}) {Text("Share my referral")}
        }
        Panel("Points & progress") {Text("$points points",style=MaterialTheme.typography.headlineLarge)
            LinearProgressIndicator(progress={(points%milestone).toFloat()/milestone},Modifier.fillMaxWidth(),color=Pink)
            Text("${state["nextMilestone"]!!.jsonPrimitive.int-points} points to your next ${usd(program["milestoneCreditCents"]!!.jsonPrimitive.int)} credit")
            val claims=state["claims"]!!.jsonArray
            Text("${claims.count {it.jsonObject["status"]?.jsonPrimitive?.content=="qualified"}} qualified · ${claims.count {it.jsonObject["status"]?.jsonPrimitive?.content=="pending"}} awaiting review")
            Text("Points count lifetime milestones. Earned rewards remain in your history.",color=Muted)
        }
        val referred=state["referredBy"]
        if(referred==null || referred is JsonNull) Panel("Someone referred you?") {Field("Their referral code",code,{code=it.uppercase().take(30)});Button(enabled=code.isNotBlank() && !busy,onClick={action(mapOf("action" to "claim","code" to code))}) {Text("Submit referral code")}}
        else Text("Your submitted referral: ${referred.jsonObject["status"]!!.jsonPrimitive.content}")
        Panel("Reward history") {
            val rewards=state["rewards"]!!.jsonArray
            if(rewards.isEmpty()) Text("Your first qualified referral unlocks your first reward.")
            rewards.forEach {value->val r=value.jsonObject;Text("${usd(r["amountCents"]!!.jsonPrimitive.int)} · ${if(r["kind"]!!.jsonPrimitive.content=="milestone") "Points milestone" else "Referral reward"}")
                Text(r["status"]!!.jsonPrimitive.content+(r["method"]?.takeUnless {it is JsonNull}?.jsonPrimitive?.content?.let {" · $it"} ?: ""),color=Muted)
                if(r["status"]!!.jsonPrimitive.content=="available") TextButton(enabled=!busy,onClick={choice=r}) {Text("Choose my reward")}
            }
        }
        Panel("Program details") {Text(program["terms"]!!.jsonPrimitive.content,style=MaterialTheme.typography.bodySmall)}
    }
    if(repo.connection!=null) OutlinedButton(enabled=!busy,onClick={action()}) {Text(if(busy) "Updating…" else "Refresh rewards")}
    choice?.let {reward->AlertDialog(onDismissRequest={choice=null},title={Text("Choose your $20 reward")},text={Text("Each reward can be redeemed once. The firm records the completed payment or invoice credit.")},confirmButton={TextButton(onClick={choice=null;action(mapOf("action" to "redeem","rewardId" to reward["id"]!!.jsonPrimitive.content,"method" to "credit"))}) {Text("Tax-prep credit")}},dismissButton={if(reward["kind"]!!.jsonPrimitive.content=="referral") TextButton(onClick={choice=null;action(mapOf("action" to "redeem","rewardId" to reward["id"]!!.jsonPrimitive.content,"method" to "cash"))}) {Text("Cash reward")} else TextButton(onClick={choice=null}) {Text("Cancel")}})}
}

@Composable fun PrivacyScreen() {
    Panel("Your records") {Text("Journals, receipts, sessions and GPS route samples are encrypted with an Android Keystore key in private app storage. Device backup is disabled. Uninstalling or losing this phone can remove unsynced records; sync or export regularly.")}
    Panel("What is shared") {Text("Connecting a client workspace and choosing Sync sends journal entries and receipts to your firm. Route coordinates stay on this phone. Optional nearby-stop lookup sends the current stopped location to OpenStreetMap Overpass; opening Maps shares route endpoints with your maps provider. Receipt text recognition runs on the phone using the bundled ML Kit model.")}
    Panel("Bank records") {Text("Secure linking uses Plaid and your bank's consent flow. Bank passwords do not pass through the firm. The firm stores encrypted access tokens for permitted transaction access. Imported transactions remain for review; pending, unknown-currency and test transactions cannot be posted. Disconnecting stops future bank access; it does not erase records already imported.")}
    Panel("Tracking limits") {Text("GPS can be inaccurate, interrupted or stopped by Android. Automatic detection cannot identify a paid ride, business purpose, or exact earnings. Review each trip and expense. Profit uses the fare, fees and vehicle-cost assumption you enter; tax treatment requires your preparer's review.")}
    Panel("Rewards") {Text("Your workspace maintains referral status, points, reward requests and staff fulfillment records. Referrers cannot view a friend's tax documents or client details. Staff verifies eligibility before issuing rewards.")}
}

fun exportCSV(journal: Journal): String {
    fun cell(value: String): String {val safe=if(value.trimStart().firstOrNull() in listOf('=','+','-','@','\t','\r')) "'"+value else value;return "\""+safe.replace("\"","\"\"")+"\""}
    val header=listOf("id","kind","date","description","amount_cents","classification","category","miles","fare_cents","fees_cents","platform","work_area","bank_source","details_json")
    return (listOf(header)+journal.visible.map {entry->val r=entry.record;val t=if(r.kind=="trip") r.trip() else null;val e=if(r.kind=="expense") r.expense() else null;val i=if(r.kind=="income") r.income() else null
        listOf(r.id,r.kind,r.date,r.title,(e?.amountCents ?: i?.amountCents)?.toString() ?: "",e?.classification ?: t?.classification ?: "",e?.category ?: "",t?.let {(it.distanceMeters/1609.344).toString()} ?: "",t?.earningsCents?.toString() ?: "",t?.platformFeesCents?.toString() ?: "",t?.platform ?: i?.platform ?: "",t?.workArea ?: "",r.bankReference?.transactionId ?: "",r.body.toString())
    }).joinToString("\r\n") {it.joinToString(",",transform=::cell)}+"\r\n"
}
