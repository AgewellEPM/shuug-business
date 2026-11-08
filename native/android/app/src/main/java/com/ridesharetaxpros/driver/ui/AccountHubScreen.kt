package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import com.ridesharetaxpros.driver.tracking.DriveService

fun openPublicLink(repo:DriverRepository,url:String) {
    val uri=Uri.parse(url)
    require(uri.scheme=="https" && uri.host!=null && uri.userInfo==null) {"Use a public HTTPS link."}
    repo.app.startActivity(Intent(Intent.ACTION_VIEW,uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
@Composable fun AccountHubScreen(repo:DriverRepository,navigate:(String)->Unit,onTracking:()->Unit) {
    var address by remember(repo.scope) {mutableStateOf(repo.connection?.origin ?: "")}
    var email by remember(repo.scope) {mutableStateOf("")};var password by remember(repo.scope) {mutableStateOf("")}
    var expanded by remember {mutableStateOf(false)};var busy by remember {mutableStateOf(false)}
    var confirmation by remember {mutableStateOf<String?>(null)}
    var includeReputation by remember(repo.scope) {mutableStateOf(false)}
    var includeCoach by remember(repo.scope) {mutableStateOf(false)}
    var includeOffline by remember(repo.scope) {mutableStateOf(false)}
    var reauth by remember(repo.scope) {mutableStateOf(false)}
    var editingProfile by remember(repo.scope) {mutableStateOf(false)}
    var profileName by remember(repo.scope) {mutableStateOf(repo.connection?.session?.account?.name.orEmpty())}
    var notice by remember(repo.scope) {mutableStateOf<String?>(null)}
    val accountBlocked=repo.busy || repo.updatingProfile || repo.changingAccount || busy || repo.journal.activeTripId!=null
    LaunchedEffect(repo.scope) {
        if(repo.connection==null && address.isBlank()) {
            busy=true
            try {address=WorkspaceClient.discover().orEmpty()} catch(error:kotlinx.coroutines.CancellationException) {throw error} catch(_:Exception) { /* Manual workspace address remains available. */ } finally {busy=false}
        } else if(repo.connection!=null) repo.refreshProfile()
    }
    LaunchedEffect(repo.connection?.session?.account?.name) {if(!editingProfile)profileName=repo.connection?.session?.account?.name.orEmpty()}
    Panel {BrandHeader();HorizontalDivider();Text("Connect your client account to keep this app and your tax portal together in the same private workspace for your tax team’s review.")}
    if(repo.connection==null) {
        Panel("1 · Open your client account") {
            Text("Activate the invitation from your tax team in My Portal. Use that same email and password here.")
            TextButton(onClick={repo.run {openPublicLink(repo,"https://gigtax.pro/client-portal")}}) {Text("Open My Portal / activate invitation")}
            TextButton(enabled=!busy,onClick={busy=true;repo.run {try {address=WorkspaceClient.discover() ?: "";if(address.isBlank()) repo.failure="Your firm’s online account connection is still being prepared. Your records remain saved on this phone; you can keep using the app."} finally {busy=false}}}) {Text("Find my firm’s workspace")}
            NavigationRow("Use an address supplied by my firm",{expanded=!expanded})
            if(expanded) Field("HTTPS workspace address",address,{address=it})
        }
        Panel("2 · Sign in to your profile") {
            Field("Client email",email,{email=it});Field("Client password",password,{password=it},secret=true)
            Text("Your owner or staff login is separate from your invited client account.",color=Muted)
        }
        Panel("3 · Choose your records and sync") {
            Text("This account’s trips, income, expenses and attached receipts stay together when you sync.",color=Muted)
            if(repo.journal.visible.isNotEmpty()) Toggle("Copy my phone-only trips, money and receipts",includeOffline) {includeOffline=it}
            if(repo.journal.reputationState.ratings.isNotEmpty() || repo.journal.reputationState.reviews.isNotEmpty()) Toggle("Copy my phone-only ratings & reviews",includeReputation) {includeReputation=it}
            if(repo.journal.coachMessages.isNotEmpty()) Toggle("Copy my phone-only Tax & Goals chat",includeCoach) {includeCoach=it}
            Text("Only the records you select will be copied and shared with your tax team. The original phone-only source remains available for recovery.",color=Muted)
            Action(if(busy || repo.changingAccount) "Connecting…" else "Connect my client account",{
                val copyRecords=includeOffline;val copyChat=includeCoach;val copyRatings=includeReputation
                busy=true;repo.run {try {
                    repo.connect(address,email,password);password=""
                    if(copyRecords || copyChat || copyRatings) {repo.transferGuest(copyChat,copyRatings,copyRecords);repo.sync();repo.syncProfileReputation();repo.syncTaxCoach(java.time.LocalDate.now().minusDays(29).toString(),today())}
                } finally {busy=false}}
            },enabled=!accountBlocked && address.isNotBlank() && email.isNotBlank() && password.isNotBlank())
        }
    } else {
        Panel("Your client account") {
            Text(repo.connection!!.session.account.name);Text(repo.connection!!.session.account.email,color=Muted)
            NavigationRow("Edit display name",{editingProfile=!editingProfile})
            if(editingProfile) {
                Field("Display name",profileName,{profileName=it})
                Action(if(repo.updatingProfile) "Saving profile…" else "Save display name",{repo.run {
                    repo.updateProfileName(profileName);profileName=repo.connection?.session?.account?.name.orEmpty();editingProfile=false;notice="Your display name was updated in the app and My Portal."
                }},false,!accountBlocked && runCatching {validatedDisplayName(profileName)}.isSuccess)
                Text("Ask your tax team to change your sign-in email.",color=Muted)
            }
            repo.profileError?.let {Text("Profile refresh: $it",color=Muted)}
            Text("Firm: ${repo.connection!!.session.branding.name}",color=Muted)
            Text("${repo.journal.pendingRecords.size} records awaiting sync · last synced ${repo.journal.lastSyncAt ?: "never"}",color=Muted)
            Action(if(repo.busy) "Syncing…" else "Sync with firm",{repo.run {
                repo.sync();repo.syncProfileReputation()
                repo.syncTaxCoach(java.time.LocalDate.now().minusDays(29).toString(),today())
            }},enabled=!repo.busy && !repo.changingAccount && !repo.updatingProfile)
            NavigationRow("Open My Portal",{repo.run {openPublicLink(repo,repo.connection!!.origin+"/api/website/customer")}})
            Toggle("Include phone-only ratings & reviews when copying",includeReputation) {includeReputation=it}
            Toggle("Include phone-only Tax & Goals chat when copying",includeCoach) {includeCoach=it}
            NavigationRow("Copy my phone-only records to this client account",{confirmation="transfer"})
            NavigationRow("My tax documents & progress",{navigate("My tax documents & progress")})
            NavigationRow("Protected data · Key setup & status",{navigate("Protected data")})
            NavigationRow("Protected Journal · Encrypted snapshots",{navigate("Protected Journal")})
            TextButton(enabled=!accountBlocked,onClick={reauth=true;password=""}) {Text("Sign in again")}
            if(reauth) {
                Text("Reconnect ${repo.connection!!.session.account.email}. Sign out first to switch to another client account.",color=Muted)
                Field("Client password",password,{password=it},secret=true)
                Action(if(repo.changingAccount) "Signing in…" else "Reconnect this account",{busy=true;repo.run {try {
                    repo.reauthenticate(password);password="";reauth=false;notice="Your account is connected again. Saved records stayed with this client."
                } finally {busy=false}}},enabled=!accountBlocked && password.isNotBlank())
                TextButton(enabled=!busy && !repo.changingAccount,onClick={reauth=false;password=""}) {Text("Cancel sign-in")}
            }
            TextButton(enabled=!accountBlocked,onClick={confirmation="signout"}) {Text("Sign out / switch account",color=Danger)}
            if(repo.journal.activeTripId!=null) Text("Finish your current drive before signing out or changing accounts.",color=Muted)
        }
    }
    notice?.let {Text(it,color=Link)}
    repo.journal.entries.filter {it.conflict!=null}.forEach {entry->Panel("Review sync conflict") {
        Text(entry.record.title);Text("Your phone and workspace both changed this record. Review both copies before choosing.",color=Muted)
        Text("Phone: ${entry.record.body}");Text("Workspace: ${entry.conflict!!.record.body}")
        Action("Keep phone version",{repo.run {repo.resolve(entry.record.id,true)}},false)
        Action("Use workspace version",{repo.run {repo.resolve(entry.record.id,false)}},false)
    }}
    Panel {
        NavigationRow("Find an office · Help & appointments",{navigate("Get help")})
        NavigationRow("Getting-started video",{navigate("Getting started")})
        NavigationRow("Driving & expense reminders",{navigate("Driving & expense reminders")})
        NavigationRow("Read gig offers · Screen sharing & screenshots",{navigate("Offer reader")})
        NavigationRow("Driver Rewards · Referrals & points",{navigate("Driver Rewards")})
    }
    Panel("On your phone") {
        Text("Records save locally before syncing. Signing out keeps each account’s journal separate; reconnect to the same account to see its saved records.",color=Muted)
        Text("GPS route points are not shared with your firm. Trip details, recorded mileage, expenses, income and the receipts you attach are shared when you connect and sync.",color=Muted)
        Text("Bank imports and receipt suggestions need your review. There is no automatic tax filing. Direct bank linking requires your firm’s configured provider.",color=Muted)
        NavigationRow("App privacy & data",{navigate("App privacy & data")})
        NavigationRow("Gig Tax Pros website",{repo.run {openPublicLink(repo,"https://gigtax.pro")}})
        NavigationRow("Open Android app settings",{repo.app.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+repo.app.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))})
    }
    confirmation?.let {kind->AlertDialog(onDismissRequest={confirmation=null},title={Text(if(kind=="transfer") "Copy phone-only records to this client?" else "Sign out of this account?")},
        text={Text(if(kind=="transfer") "The copied records and receipts can sync to your tax team. Ratings/reviews and chat are copied only when selected above. Existing account tax details are kept. The original phone-only source remains available for recovery." else "Saved and unsynced account records remain separately on this phone. Reconnect to the same account to sync them later.")},
        confirmButton={TextButton(onClick={confirmation=null;repo.run {if(kind=="transfer")repo.transferGuest(includeCoach,includeReputation) else repo.disconnect()}}) {Text("Confirm")}},dismissButton={TextButton(onClick={confirmation=null}) {Text("Cancel")}})}
}
@Composable fun AssistanceScreen(repo:DriverRepository,onTracking:()->Unit) {
    Panel("Trip & expense assistance") {
        Text("Choose the reminders you want. Location monitoring shows a persistent Android notification and may use more battery.",color=Muted)
        Toggle("Detect drives & send trip alerts",repo.journal.assistance.automaticDrives) {value->repo.run {repo.update {it.copy(assistance=it.assistance.copy(automaticDrives=value))}}}
        Text("Movement prompts Start trip? A prolonged stop prompts End trip? Recording begins after you confirm; earlier miles need review.",color=Muted)
        Toggle("Remind me near purchases",repo.journal.assistance.placeReminders) {value->repo.run {repo.update {it.copy(assistance=it.assistance.copy(placeReminders=value))}}}
        Text("When enabled, nearby-stop lookup sends a stopped location to OpenStreetMap Overpass. Nothing is recorded as an expense without your review. © OpenStreetMap contributors.",color=Muted)
    }
    Panel("Background access & privacy") {
        Text("Allow precise location and notifications in Android Settings. Android may delay updates or stop assistance after a force stop. Start a drive manually when complete mileage matters.",color=Muted)
        Action("Start or resume assistance",onTracking,enabled=repo.journal.assistance.automaticDrives || repo.journal.assistance.placeReminders || repo.journal.activeTripId!=null)
        Action("Pause location monitoring",{repo.app.stopService(Intent(repo.app,DriveService::class.java))},false)
        Text(repo.trackingStatus,color=Muted)
    }
}
