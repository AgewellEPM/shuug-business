package com.ridesharetaxpros.driver.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

@Composable fun usePrivateAccount(repo:DriverRepository):Boolean {
    val configured=remember {runCatching {repo.app.assets.open("SecureTaxTrustedPins.json").use {ProtectedPins.decode(boundedRead(it,16384))}}.isSuccess}
    return repo.connection?.access==AccountAccess.PRIVATE || repo.connection==null && configured
}

@Composable fun PrivateAccountScreen(repo:DriverRepository) {
    val pins=remember {repo.app.assets.open("SecureTaxTrustedPins.json").use {ProtectedPins.decode(boundedRead(it,16384))}}
    val client=remember {PrivateAccountClient(pins)}
    var accountCode by remember {mutableStateOf(repo.connection?.session?.account?.id.orEmpty())}
    var password by remember {mutableStateOf("")};var code by remember {mutableStateOf("")}
    var backupPassword by remember {mutableStateOf("")}
    var challenge by remember {mutableStateOf<PrivateMfaChallenge?>(null)}
    var recoveryCodes by remember {mutableStateOf<List<String>>(emptyList())}
    var busy by remember {mutableStateOf(false)};var message by remember {mutableStateOf<String?>(null)}
    var signIn by remember {mutableStateOf(repo.connection==null)}
    var confirmCopy by remember {mutableStateOf(false)};var confirmSignOut by remember {mutableStateOf(false)}
    val blocked=busy || repo.busy || repo.changingAccount || repo.journal.activeTripId!=null
    fun action(work:suspend ()->Unit) {if(busy)return;busy=true;repo.run {try {message=null;work()}catch(error:Exception){message=error.message}finally {busy=false}}}
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri->
        val passphrase=backupPassword.toCharArray();backupPassword=""
        if(uri==null)passphrase.fill('\u0000')
        else action {
            try {
                val connection=repo.connection ?: error("Sign in to your private account first.")
                require(connection.access==AccountAccess.PRIVATE && connection.encryptionProfile==pins.profile)
                val scope=ProtectedJournalScope(pins.workspaceOrigin,pins.workspaceId,ProtectedIdentity(connection.session.account.id,connection.privateClientId!!),pins.profile)
                withContext(Dispatchers.IO) {
                    val raw=Wire.parseToJsonElement(WorkspaceClient(connection).customer("${pins.apiPrefix}/status",maximum=65536).toString(Charsets.UTF_8)).jsonObject
                    require(Wire.decodeFromJsonElement<ProtectedIdentity>(raw["identity"]!!)==scope.identity && raw["enrolled"]?.jsonPrimitive?.boolean==true && (raw["profile"]?.jsonPrimitive?.content)==pins.profile)
                    val manifest=ProtectedManifest.decode(raw["manifest"]!!.toString().toByteArray(Charsets.UTF_8))
                    val bytes=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,8192)}
                    try {
                        require(repo.connection==connection) {"Your account changed. Reopen key import."}
                        ProtectedDeviceKeyStore(repo.app,scope,pins).importBrowserBackup(bytes,passphrase,manifest)
                    } finally {bytes.fill(0)}
                }
                require(repo.connection==connection)
                repo.resumePrivateSync();message="Your approved key is ready. Saved records will sync encrypted while the app is running and the phone is unlocked."
            } finally {passphrase.fill('\u0000')}
        }
    }
    Panel("Your private Gig Tax Pros account") {
        Text("Use the same private account on this phone and at portal.gigtax.pro. Your trips, income, expenses, saved preferences and receipts are encrypted before upload.")
        Action("Open private website portal",{repo.run {openPublicLink(repo,"https://portal.gigtax.pro")}},false)
        if(repo.connection==null) Text("Activate the invitation from your tax team in the website portal first. Keep your encrypted client-key backup and its separate passphrase.",color=Muted)
        message?.let {Text(it,color=Link)}
    }
    if(signIn) Panel("Sign in") {
        PrivateSocialSignIn(repo,pins,blocked) {challenge=it;signIn=true}
        if(challenge==null) {
            Field("Private account code",accountCode,{accountCode=it.trim()});Field("Account password",password,{password=it},secret=true)
            Action(if(busy) "Checking…" else "Continue",{
                val secret=password;password=""
                action {challenge=client.begin(accountCode.trim(),secret)}
            },enabled=!blocked && accountCode.isNotBlank() && password.isNotBlank())
        } else {
            if(challenge!!.enrollmentRequired) {Text("Add this setup key to your authenticator. Keep the key private.");Text(challenge!!.secret.orEmpty())}
            Field("Authenticator or unused recovery code",code,{code=it},secret=true)
            Action("Verify and sign in",{
                val value=code;code=""
                action {
                    val session=client.complete(challenge!!,value)
                    recoveryCodes=session.recoveryCodes
                    repo.connectPrivate(session.connection(pins));challenge=null;signIn=false
                    message="Signed in. Import your approved encrypted client-key backup below to enable this phone’s private sync."
                }
            },enabled=!blocked && code.isNotBlank())
            TextButton(enabled=!busy,onClick={challenge=null;code=""}) {Text("Start sign-in again")}
        }
    }
    if(recoveryCodes.isNotEmpty()) Panel("Save your recovery codes privately") {
        Text("Each code works once if your authenticator is unavailable. Store these separately from this phone.")
        recoveryCodes.forEach {Text(it)}
        TextButton(onClick={recoveryCodes=emptyList()}) {Text("I saved the codes")}
    }
    if(repo.connection?.access==AccountAccess.PRIVATE) {
        Panel("Google and Apple sign-in") {PrivateSocialSignIn(repo,pins,blocked,manage=true) {challenge=it;signIn=true}}
        Panel("Encrypted sync") {
            Text("Account: ${repo.connection!!.session.account.id}",color=Muted)
            Text("Last sync check: ${repo.privateSyncAt ?: "Waiting for this phone’s first check"}")
            Text("Changes upload automatically while this app is running, online and unlocked. Reopening the app retries saved changes. The website refreshes after you sign in and unlock your key. Routes remain on this phone.",color=Muted)
            Action(if(repo.busy) "Syncing…" else "Sync now",{action {repo.sync();message="Encrypted records checked with your workspace."}},enabled=!blocked)
            Action("Sign in again",{signIn=true;challenge=null;password=""},false,!blocked)
        }
        Panel("Connect this phone’s encryption key") {
            Text("Choose the encrypted client-key backup created in your website portal. Use its separate backup passphrase. Both stay on this phone; the server receives neither.",color=Muted)
            Field("Backup passphrase",backupPassword,{backupPassword=it},secret=true)
            Action("Choose encrypted key backup",{importer.launch(arrayOf("application/json","text/json"))},false,!blocked && backupPassword.length in 16..1024)
            Text("Keep a secure screen lock. Only you hold the decryption key. Losing every usable key, backup and passphrase makes the encrypted contents unrecoverable. Gig Tax Pros cannot recover them.",color=Muted)
        }
        Panel("Your phone-only records") {
            Text("Copying includes your phone-only journal, receipts, saved chat, ratings and preferences. The original phone-only copy remains available.",color=Muted)
            Action("Copy phone-only records into this account",{confirmCopy=true},false,!blocked)
            TextButton(enabled=!blocked,onClick={confirmSignOut=true}) {Text("Disconnect private account")}
        }
    }
    if(confirmCopy) AlertDialog(onDismissRequest={confirmCopy=false},title={Text("Copy phone-only records?")},text={Text("These records will be encrypted only for your client key, then uploaded automatically. The original stays on this phone.")},confirmButton={TextButton(onClick={confirmCopy=false;action {repo.transferGuest(includeCoach=true,includeReputation=true);repo.resumePrivateSync()}}) {Text("Copy and sync")}},dismissButton={TextButton(onClick={confirmCopy=false}) {Text("Cancel")}})
    if(confirmSignOut) AlertDialog(onDismissRequest={confirmSignOut=false},title={Text("Disconnect this private account?")},text={Text("Account records and their encrypted retries remain separately on this phone. The server session is revoked when reachable.")},confirmButton={TextButton(onClick={confirmSignOut=false;action {repo.disconnect();recoveryCodes=emptyList();challenge=null;password="";backupPassword="";signIn=true}}) {Text("Disconnect")}},dismissButton={TextButton(onClick={confirmSignOut=false}) {Text("Cancel")}})
}
