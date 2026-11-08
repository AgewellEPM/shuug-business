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
    val exportJournal=rememberJournalExport(repo)
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
    OutlinedButton(onClick=exportJournal,Modifier.fillMaxWidth()) {Text("Export journal CSV")}
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
    val context=androidx.compose.ui.platform.LocalContext.current
    var linkError by remember { mutableStateOf<String?>(null) }
    Panel("Drives you control") {
        Text("The app records drives you start. Optional drive detection and purchase-stop reminders use the location permissions you grant, a visible monitoring notification and battery. Movement can prompt you to start a drive; recording starts when you confirm. Turn both assistance options off and end any active drive to stop recording.")
        Text("Android restrictions, force-stopping, permission changes and poor GPS can leave missing mileage. Review each drive. Detection cannot identify a paid job, business purpose or exact earnings for you.",color=Muted)
        Text("Historical GPS route files stay in this phone’s private storage and are excluded from ordinary firm record sync. Opening Directions shares the selected endpoints with the Google Maps app. Requested in-app Google comparisons send selected endpoints through the firm’s authenticated routing service to Google; they are not added to tax records. Device backup and transfer are disabled for this app.",color=Muted)
    }
    Panel("Expenses and receipts") {
        Text("You choose the expenses, income entries, receipt photos and scans to save. Receipt text recognition runs on this phone with the bundled ML Kit model. Suggested merchants and amounts need your review; they are not automatically posted.")
        Text("Nearby purchase-stop reminders send a stopped location to the public OpenStreetMap Overpass service only when that assistance option is enabled. A nearby place is a suggestion, not proof of a purchase or deductible expense.",color=Muted)
        Text("Private PDF and image previews stay inside the app. PDF preview uses a temporary private descriptor that is removed after use. Save a copy writes the unchanged bytes only to the location you choose.",color=Muted)
    }
    Panel("Office help & appointments") {
        Text("The app refreshes public office addresses, hours, exterior photos and contact options from GigTax.pro. Nearby-office location is requested only when you choose it; distance sorting happens on your phone. Android’s Geocoder service receives ZIP searches. OpenStreetMap receives the map areas you view, and map tiles are cached on this phone.")
        Text("Opening directions or street surroundings shares the requested location with your chosen maps provider. Your office-search location is not added to the tax journal or sent to your firm.",color=Muted)
        Text("Calling opens the phone’s call flow. Booking opens the office’s appointment provider, where you choose what to submit and confirm the appointment.",color=Muted)
    }
    Panel("Positioning & road comparisons") {
        Text("Destination search uses Android’s Geocoder service. When you request a road comparison, the configured routing service receives the selected endpoints, including historical job starts or drop-offs needed for that comparison. The street-map provider receives the areas you view.")
        Text("Google Maps is the default for in-app road comparisons and needs firm setup. Requested endpoints go through the firm’s authenticated routing service to Google. An explicitly selected OSRM development mode may use a disclosed demonstration without live traffic; it is never a fallback for missing Google setup.",color=Muted)
        Text("Waiting-area matches describe your recorded jobs. They do not predict live demand, guarantee a paying offer or reserve a place to wait.",color=Muted)
    }
    Panel("Offer reading you control") {
        Text("Optional screen reading uses Android’s screen-capture permission and a visible foreground notification. Captured frames are read locally using the bundled ML Kit text-recognition model. Turn off screen reading to end the capture session.")
        Text("Detected offer details and your review decisions are saved in this phone’s journal. Review the platform, pay, route, time and missing details before relying on an estimate. The app does not accept or decline work in a provider’s app.",color=Muted)
    }
    Panel("Optional firm connection") {
        Text("After you sign in to your invited client account, queued trip details, mileage totals, classifications, notes, income, expenses and chosen receipts sync to that firm’s private workspace. Staff with financial-record access can review them. Historical route files are excluded from these uploads.")
        Text("The app does not save your sign-in password. Its session credential and account journals are encrypted in private app storage with an Android Keystore key. Accounts have separate phone journals. Signing out hides the connected account’s records until the same account is connected again.",color=Muted)
        Text("Ratings and reviews are personal entries you choose to record; providers do not send them here automatically. Connected entries can be shared with this client account. Guest reputation and chat are copied into an account only when you explicitly choose those options.",color=Muted)
    }
    Panel("Protected Journal & older workspace data") {
        Text("Protected Journal requires public keys independently included in the signed app, verified firm approval for this device’s client key, and matching active workspace enrollment. Its client-encrypted snapshot can be opened by the approved client and firm recovery keys. Without those requirements, no encrypted snapshot is uploaded.")
        Text("The dedicated client-key copy is wrapped by an OS-enforced unlocked-device Android Keystore key, requires Android 9 or newer and a secure screen lock, and is excluded from device backup. Explicitly rewrapping an earlier key keeps its original encrypted file with its previous storage protections for recovery review.",color=Muted)
        Text("A snapshot includes the saved Journal, goals, offer and review history, chat and current tracking/settings state. Current tracking state can contain a recent location. Historical route files, receipt contents and server-only tax/profile/provider data are separate. Preview and import review do not restore or replace your live records.",color=Muted)
        Text("Encrypted-object routing metadata, recipient public keys, revisions and deletion state remain visible to the host. Encryption does not migrate older plaintext workspace records or erase retained exports and backups. A matching independently bundled pin blocks legacy app uploads; it does not retroactively protect old data or pages opened in another app.",color=Muted)
        Text("A server acknowledgment does not prove independent backup or recovery. Deleting a remote archive keeps the local Journal, attachments and any retained historical backups.",color=Muted)
    }
    Panel("Banks, statements & estimates") {
        Text("CSV, OFX and QFX statement imports stay in the phone’s review inbox until you save entries. Approved entries, bank source references and selected receipts join your synced journal. Goals and vehicle-cost estimates stay on the phone unless you explicitly send them with a coach question or encrypted Journal snapshot.")
        Text("Optional direct bank linking uses Plaid’s SDK and your bank’s consent flow. Bank passwords are not received by this app. The firm stores encrypted provider access tokens and downloaded transactions; authorized workspace administrators control that storage. This app downloads the feed for review. Updates are periodic and can include corrections.",color=Muted)
        Text("Disconnect in Money → Banks & statement imports → Connect a bank to revoke future provider access. Previously imported history and journal entries remain; ask your firm about retention. Pending, unsupported-currency and sandbox test transactions cannot be posted to the real journal.",color=Muted)
        TextButton(onClick={runCatching {context.startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://plaid.com/legal/#end-user-privacy-policy")))}.onFailure {linkError="The Plaid privacy policy could not be opened."}}) {Text("Plaid privacy policy",color=Link)}
        linkError?.let {Text(it,color=Caution,style=MaterialTheme.typography.bodySmall)}
    }
    Panel("Tax & Goals chat") {
        Text("Phone guidance uses the records and assumptions you saved. Sending a connected question shares its text, selected period and applicable cost/goal assumptions with your firm’s workspace. Replies identify phone analysis or record-based workspace guidance and include source links when available.")
        Text("Tax-prep details change only when you confirm them. Chat does not calculate tax owed or file a return or payment. Keep passwords, verification codes, full Social Security numbers and bank credentials out of chat.",color=Muted)
    }
    Panel("Your choices") {
        Text("You can review, correct, classify, export and delete journal entries. Deletions sync as deleted records so another device does not restore an old copy; the firm may retain historical records. Ask your firm about access and retention.")
        Text("CSV export sends the selected journal through Android’s share/save flow. The app’s device backup is disabled. Uninstalling, reinstalling or losing this phone can erase phone-only records and its client key. Export important records and verify any approved recovery arrangement before removing the app.",color=Muted)
    }
    Panel("Rewards") {
        Text("The workspace maintains referral status, points, reward requests and staff fulfillment records. Referrers cannot view a friend’s tax documents or client details. Staff verifies eligibility before issuing rewards.")
    }
    Panel("Included services") {
        Text("The app uses Android location and notification services, Android Geocoder, OpenStreetMap office maps, native Google Maps when configured, and an authenticated Google Routes service for requested comparisons, bundled on-device ML Kit recognition and Plaid for optional bank linking. No advertising SDK or automatic tax-filing connection is included.")
        Text("Find my firm’s workspace retrieves the public connection address from the firm’s website. Calling, appointment providers, bank linking, your chosen maps app and pages opened in a browser have their own data practices.",color=Muted)
    }
}
