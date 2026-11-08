package com.ridesharetaxpros.driver.ui

import android.app.KeyguardManager
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.security.KeyPairGenerator
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Composable fun ProtectedDataScreen(repo:DriverRepository) {
    val identityToken=repo.connection?.session?.token
    var pins by remember(repo.scope,identityToken) {mutableStateOf<ProtectedPins?>(null)};var identity by remember(repo.scope,identityToken) {mutableStateOf<ProtectedIdentity?>(null)}
    var server by remember(repo.scope,identityToken) {mutableStateOf<JsonObject?>(null)};var client by remember(repo.scope,identityToken) {mutableStateOf<ProtectedRecipient?>(null)}
    var staged by remember(repo.scope,identityToken) {mutableStateOf<ProtectedManifest?>(null)};var message by remember(repo.scope,identityToken) {mutableStateOf<String?>(null)};var confirmation by remember(repo.scope,identityToken) {mutableStateOf(false)}
    var busy by remember {mutableStateOf(false)}
    fun filename()="protected-key-"+PrivateStore.hash((pins?.workspaceOrigin ?: "")+"|"+(pins?.workspaceId ?: "")+"|"+(identity?.accountId ?: "")+"|"+(identity?.clientId ?: ""))+".json"
    fun requireIdentity() {require(repo.connection?.session?.token==identityToken && identityToken!=null) {"Your account changed. Reopen protected setup."};require(!repo.app.getSystemService(KeyguardManager::class.java).isDeviceLocked) {"Unlock this phone to access its protected client key."}}
    fun reload() {val connection=repo.connection ?: return;busy=true;repo.run {try {
        val data=repo.app.assets.open("SecureTaxTrustedPins.json").use {boundedRead(it,16384)}
        val roots=ProtectedPins.decode(data);require(roots.workspaceOrigin==connection.origin) {"This connection does not match the workspace pinned in the signed app."};pins=roots
        val result=Wire.parseToJsonElement(WorkspaceClient(connection).customer("secure/status",maximum=65536).toString(Charsets.UTF_8)).jsonObject
        require(repo.connection?.session?.token==identityToken);val bound=Wire.decodeFromJsonElement<ProtectedIdentity>(result["identity"]!!)
        require(bound.accountId==connection.session.account.id);validateProtectedID(bound.accountId);validateProtectedID(bound.clientId);identity=bound;server=result
        repo.store.read(repo.scope,filename())?.let {raw->val saved=Wire.parseToJsonElement(raw.toString(Charsets.UTF_8)).jsonObject
            client=Wire.decodeFromJsonElement(saved["client"]!!);staged=(saved["manifest"] as? JsonObject)?.let {Wire.decodeFromJsonElement(it)}}
        message=null
    }catch(e:java.io.FileNotFoundException) {message="Secure setup is unavailable until your firm’s public signing and recovery keys are included in this signed app."}
    catch(e:Exception) {message=e.message}finally {busy=false}}}
    fun stage(value:ProtectedManifest) {requireIdentity();value.verify(pins!!,identity!!,client!!)
        val current=repo.store.read(repo.scope,filename()) ?: error("Create this device’s client key first.")
        val saved=Wire.parseToJsonElement(current.toString(Charsets.UTF_8)).jsonObject
        staged?.let {require(value.epoch>it.epoch || value==it) {"An older or conflicting key enrollment cannot replace this device’s verified approval."}}
        repo.store.write(repo.scope,filename(),JsonObject(saved+mapOf("manifest" to Wire.encodeToJsonElement(value))).toString().toByteArray());staged=value;message="Signed enrollment verified and staged on this phone. Encrypted sync has not been activated."
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
        if(client!=null) {Text("Client key saved on this phone");Text("The key is protected by this device’s Android Keystore and private storage. It does not sync through cloud backup or transfer to another phone.",color=Muted);Text("Public key fingerprint: ${client!!.keyId}",color=Muted)}
        else Action("Create this phone’s client key",{confirmation=true},false,pins!=null && identity!=null && !busy)
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
    if(confirmation) AlertDialog(onDismissRequest={confirmation=false},title={Text("Create a device-only client key for this account?")},text={Text("Keep this phone until firm approval and recovery have been verified. An existing key will not be replaced.")},confirmButton={TextButton(onClick={confirmation=false;repo.run {try {
        requireIdentity();require(pins!=null && identity!=null)
        val old=repo.store.read(repo.scope,filename())
        if(old==null) {val key=KeyPairGenerator.getInstance("EC").apply {initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair();val pub=protectedPublicBytes(key.public as ECPublicKey)
            val recipient=ProtectedRecipient(protectedKeyID(pub),protectedEncode(pub));val saved=buildJsonObject {put("version",1);put("privateKey",protectedEncode(key.private.encoded));put("client",Wire.encodeToJsonElement(recipient))}
            repo.store.write(repo.scope,filename(),saved.toString().toByteArray());client=recipient
        } else client=Wire.decodeFromJsonElement(Wire.parseToJsonElement(old.toString(Charsets.UTF_8)).jsonObject["client"]!!)
        message="Device key saved. Share the public enrollment request with your firm."
    }catch(e:Exception){message=e.message}}}) {Text("Create client key")}},dismissButton={TextButton(onClick={confirmation=false}) {Text("Cancel")}})
}
