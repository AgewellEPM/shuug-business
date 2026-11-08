package com.ridesharetaxpros.driver.data

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.system.Os
import android.util.AtomicFile
import com.ridesharetaxpros.driver.core.*
import java.io.File
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.bouncycastle.asn1.sec.SECNamedCurves
import org.bouncycastle.crypto.AsymmetricCipherKeyPair
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.util.PrivateKeyFactory

/** Per-account custody. The OS refuses unwrap while locked; files never enter backup. */
class ProtectedDeviceKeyStore(private val context:Context,val scope:ProtectedJournalScope,private val pins:ProtectedPins) {
    data class State(val client:ProtectedRecipient,val stagedManifest:ProtectedManifest?)
    @Serializable private data class Stored(val version:Int=2,val scope:ProtectedJournalScope,val privateKey:String,val client:ProtectedRecipient,val manifest:ProtectedManifest?=null)
    private val directory=File(context.noBackupFilesDir,"protected-client-keys")
    private val target=File(directory,scope.storageID+".bin")
    private val alias="gigtax-protected-client-v2-"+scope.storageID
    private val aad=buildJsonArray { add(2);add("shuug/android-protected-device-key");add(scope.workspaceOrigin);add(scope.workspaceId);add(scope.identity.accountId);add(scope.identity.clientId) }.toString().toByteArray(Charsets.UTF_8)
    fun requireUnlocked() {
        require(Build.VERSION.SDK_INT>=28) { "Protected client keys require Android 9 or newer with OS-enforced unlocked-device access. This phone's existing records are kept." }
        val guard=context.getSystemService(KeyguardManager::class.java)
        require(guard.isDeviceSecure) { "Set a secure screen lock before creating or opening protected client keys." }
        require(!guard.isDeviceLocked) { "Unlock this phone to access its protected client key." }
        scope.validate(pins)
    }
    private fun wrapping(create:Boolean):SecretKey {
        requireUnlocked()
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if(store.containsAlias(alias)) return store.getKey(alias,null) as? SecretKey ?: error("The protected wrapping key is unavailable. Keep this installation and ask the firm to review recovery.")
        require(create && !target.exists() && !File(target.path+".bak").exists()) { "The device wrapping key is missing. The original encrypted key was kept; it will not be replaced automatically." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).setUnlockedDeviceRequired(true).build())
            generateKey()
        }
    }
    private fun checked(value:Stored):Stored {
        require(value.version==2 && value.scope==scope) { "The saved protected key belongs to another account or unsupported format." }
        val bytes=ProtectedEnvelope.decodeBounded(value.privateKey,1,4096)
        try { pair(bytes,value.client) } finally { bytes.fill(0) }
        return value
    }
    private fun read():Stored? {
        requireUnlocked()
        if(!target.exists() && !File(target.path+".bak").exists()) return null
        val encrypted=AtomicFile(target).readFully();require(encrypted.size in 28..32768) { "The saved device key is incomplete or exceeds its supported format. Keep its original file." }
        val plaintext=Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE,wrapping(false),GCMParameterSpec(128,encrypted.copyOfRange(0,12)));updateAAD(aad);doFinal(encrypted,12,encrypted.size-12)
        }
        try {
            val objectValue=Wire.parseToJsonElement(plaintext.toString(Charsets.UTF_8)).jsonObject
            require(objectValue.keys.all { it in setOf("version","scope","privateKey","client","manifest") }) { "The saved protected key uses a future format. Its original bytes were kept." }
            return checked(Wire.decodeFromString(plaintext.toString(Charsets.UTF_8)))
        } finally { plaintext.fill(0) }
    }
    private fun save(value:Stored,create:Boolean) {
        requireUnlocked();checked(value)
        if(create) require(!target.exists() && !File(target.path+".bak").exists()) { "An existing protected key will never be overwritten by creation." }
        else require(target.exists() || File(target.path+".bak").exists()) { "The original protected key file is missing. No replacement was written." }
        val plaintext=Wire.encodeToString(value).toByteArray(Charsets.UTF_8);require(plaintext.size<=24576)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,wrapping(create));updateAAD(aad) }
        val encrypted=try { cipher.iv+cipher.doFinal(plaintext) } finally { plaintext.fill(0) }
        requireUnlocked();require(directory.isDirectory || directory.mkdirs()) { "The protected device-key directory could not be created." };Os.chmod(directory.path,448)
        val file=AtomicFile(target);val output=file.startWrite()
        try { output.write(encrypted);file.finishWrite(output) } catch(failure:Exception) { file.failWrite(output);throw failure }
        Os.chmod(target.path,384)
    }
    fun state():State?=synchronized(LOCK) { read()?.let { State(it.client,it.manifest) } }
    fun createClientKey():State=synchronized(LOCK) {
        read()?.let { return@synchronized State(it.client,it.manifest) }
        val legacyNamespace=PrivateStore.hash(scope.workspaceOrigin+"|"+scope.identity.accountId)
        require(!hasLegacy(PrivateStore(context),legacyNamespace)) { "An earlier client key exists for this account. Explicitly protect that existing key instead of creating another one." }
        val key=KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val public=protectedPublicBytes(key.public as ECPublicKey);val bytes=key.private.encoded
        try {
            val value=Stored(scope=scope,privateKey=protectedEncode(bytes),client=ProtectedRecipient(protectedKeyID(public),protectedEncode(public)))
            save(value,true);State(value.client,null)
        } finally { bytes.fill(0) }
    }
    fun stage(manifest:ProtectedManifest):State=synchronized(LOCK) {
        val current=read() ?: error("Create or explicitly protect this account's device key before importing approval.")
        manifest.verify(pins,scope.identity,current.client)
        current.manifest?.let { previous->require(manifest.epoch>previous.epoch || manifest.epoch==previous.epoch && manifest.canonicalBytes().contentEquals(previous.canonicalBytes())) { "An older or changed signed enrollment cannot replace this phone's highest verified key version." } }
        save(current.copy(manifest=manifest),false);State(current.client,manifest)
    }
    fun hasLegacy(store:PrivateStore,namespace:String):Boolean {
        requireUnlocked();return store.read(namespace,legacyFilename(scope))!=null
    }
    /** Consent is required, and the encrypted legacy source is deliberately retained. */
    fun migrateLegacy(store:PrivateStore,namespace:String,consented:Boolean):State=synchronized(LOCK) {
        require(consented) { "Explicit consent is required to protect an existing client key." };requireUnlocked()
        require(namespace==PrivateStore.hash(scope.workspaceOrigin+"|"+scope.identity.accountId)) { "The earlier key belongs to another account namespace." }
        val bytes=store.read(namespace,legacyFilename(scope)) ?: error("The earlier client key is unavailable. No new key was generated.")
        try {
            require(bytes.size<=24576);val raw=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            require(raw["version"]?.jsonPrimitive?.intOrNull==1 && raw.keys.all { it in setOf("version","privateKey","client","manifest") })
            val recipient=Wire.decodeFromJsonElement<ProtectedRecipient>(raw["client"]!!)
            val approval=(raw["manifest"] as? JsonObject)?.let { ProtectedManifest.decode(it.toString().toByteArray(Charsets.UTF_8)) }
            // Rewrapping preserves historical approval, including an expired one.
            // Actual archive use still requires fresh verification at current time.
            approval?.verify(pins,scope.identity,recipient,java.time.Instant.parse(approval.issuedAt))
            val value=Stored(scope=scope,privateKey=raw["privateKey"]!!.jsonPrimitive.content,client=recipient,manifest=approval)
            checked(value)
            val current=read()
            if(current!=null) {
                require(current.client==value.client && current.privateKey==value.privateKey) { "A different protected key already exists. Both originals were kept for firm review." }
                return@synchronized State(current.client,current.manifest)
            }
            save(value,true);State(value.client,value.manifest)
        } finally { bytes.fill(0) }
    }
    fun <T> withClientPrivateKey(operation:(AsymmetricCipherKeyPair,ProtectedEnvelope.Trusted)->T):T=synchronized(LOCK) {
        val current=read() ?: error("This device's protected client key is unavailable.")
        val approval=current.manifest ?: error("This device has no verified signed enrollment for this account.")
        approval.verify(pins,scope.identity,current.client)
        val bytes=ProtectedEnvelope.decodeBounded(current.privateKey,1,4096)
        try { operation(pair(bytes,current.client),ProtectedEnvelope.Trusted(approval.client,approval.firmRecovery)) }
        finally { bytes.fill(0) }
    }
    companion object {
        private val LOCK=Any()
        fun legacyFilename(scope:ProtectedJournalScope)="protected-key-"+PrivateStore.hash(scope.workspaceOrigin+"|"+scope.workspaceId+"|"+scope.identity.accountId+"|"+scope.identity.clientId)+".json"
        private fun pair(bytes:ByteArray,expected:ProtectedRecipient):AsymmetricCipherKeyPair {
            val key=PrivateKeyFactory.createKey(bytes) as? ECPrivateKeyParameters ?: error("The saved client key is not a supported EC key.")
            val curve=SECNamedCurves.getByName("secp256r1")
            require(key.parameters.curve==curve.curve && key.parameters.g==curve.g && key.parameters.n==curve.n && key.d>BigInteger.ZERO && key.d<curve.n) { "The saved client key is not on the trusted P-256 curve." }
            val public=key.parameters.g.multiply(key.d).normalize().getEncoded(false)
            require(protectedEncode(public)==expected.publicKey && protectedKeyID(public)==expected.keyId) { "The saved private key does not match this device's approved public key." }
            val raw=key.d.toByteArray().takeLast(32).toByteArray().let { ByteArray(32-it.size)+it }
            try { return ProtectedEnvelope.hpke().deserializePrivateKey(raw,public) } finally { raw.fill(0) }
        }
    }
}
