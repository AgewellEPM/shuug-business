package com.ridesharetaxpros.driver.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import com.ridesharetaxpros.driver.core.*
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.encodeToString

/** Private files are authenticated with a non-exportable Android Keystore key. */
class PrivateStore(context: Context) {
    private val root = File(context.filesDir,"driver").apply { mkdirs() }
    private val key: SecretKey by lazy {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("rtp-driver-storage-v1",null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder("rtp-driver-storage-v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setUserAuthenticationRequired(false).build()); generateKey()
        }
    }
    private fun file(scope: String,name: String): File {
        require(scope.matches(Regex("guest|session|[a-f0-9]{64}")))
        require(name.matches(Regex("[A-Za-z0-9.-]+")))
        return File(File(root,scope).apply { mkdirs() },name)
    }
    fun read(scope: String,name: String): ByteArray? {
        val file=file(scope,name); if(!file.exists() && !File(file.path+".bak").exists()) return null
        val bytes=AtomicFile(file).readFully(); require(bytes.size>=28) { "Saved data is incomplete. Keep this installation for recovery." }
        return Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(0,12)))
            updateAAD((scope+"/"+name).toByteArray()); doFinal(bytes,12,bytes.size-12)
        }
    }
    fun write(scope: String,name: String,bytes: ByteArray) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key); updateAAD((scope+"/"+name).toByteArray()) }
        val output=cipher.iv+cipher.doFinal(bytes); val file=AtomicFile(file(scope,name)); val stream=file.startWrite()
        try { stream.write(output); file.finishWrite(stream) } catch(error: Exception) { file.failWrite(stream); throw error }
    }
    fun journal(scope: String): Journal = read(scope,"journal.json")?.let { Wire.decodeFromString<Journal>(it.toString(Charsets.UTF_8)) } ?: Journal()
    fun save(scope: String,journal: Journal) = write(scope,"journal.json",Wire.encodeToString(journal).toByteArray())
    fun clearConnection() { AtomicFile(file("session","connection.json")).delete() }
    fun receipt(scope: String,id: String): ByteArray = read(scope,"receipt-$id") ?: error("Receipt is unavailable on this phone.")
    fun saveReceipt(scope: String,id: String,bytes: ByteArray) { require(bytes.size<=5*1024*1024); write(scope,"receipt-$id",bytes) }
    // Route samples remain local and use separate append-only records, avoiding
    // full-history rewrites on each GPS fix. Each line is independently encrypted.
    fun appendRoute(scope: String,id: String,fix: LocationFix) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key); updateAAD((scope+"/route-"+id).toByteArray()) }
        val bytes=cipher.iv+cipher.doFinal(Wire.encodeToString(fix).toByteArray())
        file(scope,"route-$id").appendText(android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)+"\n")
    }
    fun route(scope: String,id: String): List<LocationFix> {
        val source=file(scope,"route-$id"); if(!source.exists()) return emptyList()
        return source.useLines { lines -> lines.take(100000).map { line ->
            val bytes=android.util.Base64.decode(line,android.util.Base64.NO_WRAP)
            val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,key,GCMParameterSpec(128,bytes.copyOfRange(0,12))); updateAAD((scope+"/route-"+id).toByteArray()) }
            Wire.decodeFromString<LocationFix>(cipher.doFinal(bytes,12,bytes.size-12).toString(Charsets.UTF_8))
        }.toList() }
    }
    fun copyRoute(from: String,to: String,id: String) { for(fix in route(from,id)) appendRoute(to,id,fix) }
    companion object { fun hash(value: String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) } }
}
