package com.ridesharetaxpros.driver.ui

import android.app.KeyguardManager
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.serialization.json.*

@Composable fun ProtectedDataScreen(repo:DriverRepository) {
    val identityToken=repo.connection?.session?.token
    var pins by remember(repo.scope,identityToken) {mutableStateOf<ProtectedPins?>(null)};var identity by remember(repo.scope,identityToken) {mutableStateOf<ProtectedIdentity?>(null)}
    var server by remember(repo.scope,identityToken) {mutableStateOf<JsonObject?>(null)};var client by remember(repo.scope,identityToken) {mutableStateOf<ProtectedRecipient?>(null)}
    var staged by remember(repo.scope,identityToken) {mutableStateOf<ProtectedManifest?>(null)};var message by remember(repo.scope,identityToken) {mutableStateOf<String?>(null)};var confirmation by remember(repo.scope,identityToken) {mutableStateOf<String?>(null)}
    var legacyAvailable by remember(repo.scope,identityToken) {mutableStateOf(false)}
    var busy by remember {mutableStateOf(false)}
    fun requireIdentity() {require(repo.connection?.session?.token==identityToken && identityToken!=null) {"Your account changed. Reopen protected setup."};require(!repo.app.getSystemService(KeyguardManager::class.java).isDeviceLocked) {"Unlock this phone to access its protected client key."}}
    fun keyStore():ProtectedDeviceKeyStore {
        requireIdentity();val roots=pins ?: error("This signed app has no independent firm public keys.")
        return ProtectedDeviceKeyStore(repo.app,ProtectedJournalScope(roots.workspaceOrigin,roots.workspaceId,identity ?: error("This account identity has not been verified.")),roots)
    }
    fun reload() {val connection=repo.connection ?: return;busy=true;repo.run {try {
        val data=repo.app.assets.open("SecureTaxTrustedPins.json").use {boundedRead(it,16384)}
        val roots=ProtectedPins.decode(data);require(roots.workspaceOrigin==connection.origin) {"This connection does not match the workspace pinned in the signed app."};pins=roots
        val result=Wire.parseToJsonElement(WorkspaceClient(connection).customer("secure/status",maximum=65536).toString(Charsets.UTF_8)).jsonObject
        require(repo.connection?.session?.token==identityToken);val bound=Wire.decodeFromJsonElement<ProtectedIdentity>(result["identity"]!!)
        require(bound.accountId==connection.session.account.id);validateProtectedID(bound.accountId);validateProtectedID(bound.clientId);identity=bound;server=result
        val keys=keyStore();val saved=keys.state();client=saved?.client;staged=saved?.stagedManifest;legacyAvailable=keys.hasLegacy(repo.store,repo.scope)
        message=null
    }catch(e:java.io.FileNotFoundException) {message="Secure setup is unavailable until your firm’s public signing and recovery keys are included in this signed app."}
    catch(e:Exception) {message=e.message}finally {busy=false}}}
    fun stage(value:ProtectedManifest) {requireIdentity()
        val saved=keyStore().stage(value);client=saved.client;staged=saved.stagedManifest
        message="Signed enrollment verified and staged on this phone. Encrypted sync has not been activated."
    }
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri->if(uri!=null) repo.run {try {requireIdentity();val bytes=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,16384)};stage(ProtectedManifest.decode(bytes))}catch(e:Exception){message=e.message}}}
    LaunchedEffect(repo.scope,identityToken) {if(repo.connection!=null) reload()}
    Panel("Protection status") {
        Text("Encrypted sync is not activated")
        Text("This setup prepares and verifies your device key. Existing records and documents have not been migrated to this protection.",color=Muted)
        if(repo.connection==null) Text("Connect your invited client account before setting up protected data.",color=Muted)
        if(busy) CircularProgressIndicator(color=Pink)
        message?.let {Text(it,color=Link)}
    }
    Panel("1 · Your device key") {
        if(client!=null) {Text("Client key saved on this phone");Text("Android Keystore enforces unlocked-device access to this account’s wrapping key. A secure screen lock and Android 9 or newer are required. The client key does not sync through cloud backup or transfer to another phone.",color=Muted);Text("Public key fingerprint: ${client!!.keyId}",color=Muted)}
        else if(legacyAvailable) {
            Text("An earlier client key exists for this account. Keep that key and its approval when adding OS-enforced unlocked-device protection.",color=Muted)
            Action("Protect my existing client key",{confirmation="migrate"},false,pins!=null && identity!=null && !busy)
        } else Action("Create this phone’s client key",{confirmation="create"},false,pins!=null && identity!=null && !busy)
        Text("Create a key only for the signed-in client account. Your firm must approve its public key before protected data can use it.",color=Muted)
    }
    Panel("2 · Ask your firm to approve this key") {
        client?.let {recipient->Action("Share public enrollment request",{repo.run {
            requireIdentity();val request=buildJsonObject {put("version",1);put("workspaceId",pins!!.workspaceId);put("accountId",identity!!.accountId);put("clientId",identity!!.clientId);put("client",Wire.encodeToJsonElement(recipient))}.toString()
            repo.app.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,request),"Share public enrollment request").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }},false)}
        Action("Import signed enrollment JSON",{importer.launch(arrayOf("application/json","text/json"))},false,client!=null && identity!=null && !busy)
        (server?.get("manifest") as? JsonObject)?.let {manifest->Action("Verify workspace’s signed enrollment",{repo.run {stage(ProtectedManifest.decode(manifest.toString().toByteArray()))}},false,client!=null && !busy)}
        Text("Your firm signs the public request on its separate trusted device. This app verifies that signature against public keys included in the signed app.",color=Muted)
    }
    Panel("3 · Verified enrollment and migration") {
        if(staged!=null) {Text("Signed enrollment verified on this device");Text("Key version: ${staged!!.epoch}");Text("Approval expires: ${staged!!.expiresAt}")}
        else Text("No signed key enrollment has been verified for this device.",color=Muted)
        Text("Activation is unavailable while encrypted sync and migration are being completed. Importing approval here stages it locally and does not change your workspace enrollment.",color=Muted)
        Action("Check setup again",{reload()},false,repo.connection!=null && !busy)
    }
    confirmation?.let {mode->AlertDialog(onDismissRequest={confirmation=null},title={Text(if(mode=="migrate") "Protect this existing account key?" else "Create a device-only client key for this account?")},text={Text(if(mode=="migrate") "The same client key and signed approval will be wrapped with OS-enforced unlocked-device access. The original encrypted source will remain available for recovery; no replacement key is generated." else "Use a secure screen lock and keep this phone until firm approval and recovery have been verified. An existing key will not be replaced.")},confirmButton={TextButton(onClick={confirmation=null;repo.run {try {
        val keys=keyStore();val saved=if(mode=="migrate") keys.migrateLegacy(repo.store,repo.scope,true) else keys.createClientKey()
        client=saved.client;staged=saved.stagedManifest
        message=if(mode=="migrate") "The active copy now uses OS-enforced unlocked-device access. The original encrypted file was kept for recovery with its previous storage protections." else "Device key saved. Share the public enrollment request with your firm."
    }catch(e:Exception){message=e.message}}}) {Text(if(mode=="migrate") "Protect existing key" else "Create client key")}},dismissButton={TextButton(onClick={confirmation=null}) {Text("Cancel")}})}
}
