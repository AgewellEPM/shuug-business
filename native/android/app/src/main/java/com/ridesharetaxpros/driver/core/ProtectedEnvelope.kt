package com.ridesharetaxpros.driver.core

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.bouncycastle.crypto.AsymmetricCipherKeyPair
import org.bouncycastle.crypto.hpke.HPKE

/** RFC 9180 Auth mode through the library implementation; no app-defined KDF. */
@Serializable data class ProtectedEnvelope(
    val version:Int=2,val suite:String=SUITE,val contentAlgorithm:String=CONTENT,
    val hpkeMode:String="auth",val author:Author,val context:Context,
    val nonce:String,val ciphertext:String,val recipients:List<Slot>
) {
    @Serializable data class Context(val workspaceId:String,val accountId:String,val objectId:String,val revision:Int,val domain:String) {
        fun validate() {
            listOf(workspaceId,accountId,objectId).forEach(::validateProtectedID)
            require(revision in 1..1_000_000_000 && domain in DOMAINS) { "The protected context is invalid." }
        }
    }
    @Serializable data class Author(val role:String,val keyId:String)
    @Serializable data class Slot(val role:String,val keyId:String,val publicKey:String,val encapsulatedKey:String,val wrappedKey:String)
    /** Construct from an independently pinned and signature-verified manifest only. */
    data class Trusted(val client:ProtectedRecipient,val firmRecovery:ProtectedRecipient) {
        fun validate() {
            listOf(client,firmRecovery).forEach { recipient->
                val point=protectedDecode(recipient.publicKey,65);protectedPublicKey(point)
                require(recipient.keyId==protectedKeyID(point)) { "The trusted recipient fingerprint is invalid." }
            }
            require(client.keyId!=firmRecovery.keyId) { "Client and firm recovery require separate keys." }
        }
        fun forRole(role:String)=when(role) { "client"->client;"firm-recovery"->firmRecovery;else->error("The protected recipient role is unsupported.") }
    }
    fun open(expected:Context,trusted:Trusted,role:String,privateKey:AsymmetricCipherKeyPair):ByteArray {
        expected.validate();trusted.validate()
        require(version==2 && suite==SUITE && contentAlgorithm==CONTENT && hpkeMode=="auth" && context==expected) { "The protected item's format or expected context is invalid." }
        val authorKey=trusted.forRole(author.role)
        require(author.keyId==authorKey.keyId) { "The protected author does not match trusted approval." }
        require(recipients.size==2 && recipients[0].role=="client" && recipients[1].role=="firm-recovery") { "The protected recipient slots are invalid." }
        for((index,pin) in listOf(trusted.client,trusted.firmRecovery).withIndex()) {
            val slot=recipients[index]
            require(slot.keyId==pin.keyId && slot.publicKey==pin.publicKey) { "The protected recipients differ from trusted approval." }
            protectedPublicKey(protectedDecode(slot.encapsulatedKey,65));protectedDecode(slot.wrappedKey,48)
        }
        val nonceBytes=protectedDecode(nonce,12);val encrypted=decodeBounded(ciphertext,16,MAX_CIPHERTEXT)
        val hpke=hpke();val own=trusted.forRole(role)
        require(protectedEncode(hpke.serializePublicKey(privateKey.public))==own.publicKey) { "This device does not hold the selected recipient key." }
        val slot=recipients[if(role=="client") 0 else 1]
        val aad=header(context,author,trusted)
        val key=try {
            hpke.setupAuthR(protectedDecode(slot.encapsulatedKey,65),privateKey,INFO,hpke.deserializePublicKey(protectedDecode(authorKey.publicKey,65)))
                .open(aad,protectedDecode(slot.wrappedKey,48))
        } catch(failure:Exception) { throw IllegalArgumentException("The protected item could not be authenticated with this key and context.",failure) }
        try {
            require(key.size==32)
            return Cipher.getInstance("AES/GCM/NoPadding").run {
                init(Cipher.DECRYPT_MODE,SecretKeySpec(key,"AES"),GCMParameterSpec(128,nonceBytes))
                updateAAD(contentHeader(aad,recipients));doFinal(encrypted)
            }
        } catch(failure:Exception) { throw IllegalArgumentException("The protected content or recovery slots failed authentication.",failure) }
        finally { key.fill(0) }
    }
    companion object {
        const val SUITE="HPKE-P256-SHA256-A256GCM"
        const val CONTENT="AES-256-GCM"
        const val MAX_CIPHERTEXT=16*1024*1024
        val DOMAINS=setOf("tax-document","tax-identity","driver-record","driver-receipt","driver-state","driver-route","provider-record")
        private val INFO="shuug/secure-tax-envelope/v2".toByteArray(Charsets.UTF_8)
        fun hpke()=HPKE(HPKE.mode_auth,HPKE.kem_P256_SHA256,HPKE.kdf_HKDF_SHA256,HPKE.aead_AES_GCM256)
        fun seal(plaintext:ByteArray,context:Context,trusted:Trusted,authorRole:String,authorKey:AsymmetricCipherKeyPair):ProtectedEnvelope {
            context.validate();trusted.validate();require(plaintext.size<=MAX_CIPHERTEXT-16) { "The protected item exceeds its size limit." }
            val hpke=hpke();val author=Author(authorRole,trusted.forRole(authorRole).keyId)
            require(protectedEncode(hpke.serializePublicKey(authorKey.public))==trusted.forRole(authorRole).publicKey) { "The author private key differs from trusted approval." }
            val aad=header(context,author,trusted);val contentKey=ByteArray(32).also { SecureRandom().nextBytes(it) }
            try {
                val slots=listOf("client" to trusted.client,"firm-recovery" to trusted.firmRecovery).map { (role,pin)->
                    val sender=hpke.setupAuthS(hpke.deserializePublicKey(protectedDecode(pin.publicKey,65)),INFO,authorKey)
                    Slot(role,pin.keyId,pin.publicKey,protectedEncode(sender.encapsulation),protectedEncode(sender.seal(aad,contentKey)))
                }
                val nonce=ByteArray(12).also { SecureRandom().nextBytes(it) }
                val encrypted=Cipher.getInstance("AES/GCM/NoPadding").run {
                    init(Cipher.ENCRYPT_MODE,SecretKeySpec(contentKey,"AES"),GCMParameterSpec(128,nonce))
                    updateAAD(contentHeader(aad,slots));doFinal(plaintext)
                }
                return ProtectedEnvelope(author=author,context=context,nonce=protectedEncode(nonce),ciphertext=protectedEncode(encrypted),recipients=slots)
            } finally { contentKey.fill(0) }
        }
        fun header(context:Context,author:Author,trusted:Trusted):ByteArray {
            context.validate()
            return buildJsonArray {
                add(2);add("shuug/secure-tax-envelope");add(context.domain);add(context.workspaceId);add(context.accountId);add(context.objectId);add(context.revision)
                add(CONTENT);add(SUITE);add("auth")
                add(buildJsonArray { add(author.role);add(author.keyId) })
                add(buildJsonArray { add("client");add(trusted.client.keyId) })
                add(buildJsonArray { add("firm-recovery");add(trusted.firmRecovery.keyId) })
            }.toString().toByteArray(Charsets.UTF_8)
        }
        fun contentHeader(aad:ByteArray,slots:List<Slot>):ByteArray=buildJsonArray {
            add(aad.toString(Charsets.UTF_8));slots.forEach { slot->add(buildJsonArray { add(slot.role);add(slot.keyId);add(slot.publicKey);add(slot.encapsulatedKey);add(slot.wrappedKey) }) }
        }.toString().toByteArray(Charsets.UTF_8)
        fun decodeBounded(value:String,minimum:Int,maximum:Int):ByteArray {
            require(value.length<=(maximum*4+2)/3 && value.matches(Regex("[A-Za-z0-9_-]+"))) { "The protected item encoding exceeds its supported format." }
            val bytes=java.util.Base64.getUrlDecoder().decode(value)
            require(bytes.size in minimum..maximum && protectedEncode(bytes)==value) { "The protected item encoding is invalid." };return bytes
        }
        fun decode(bytes:ByteArray):ProtectedEnvelope {
            require(bytes.size<=24*1024*1024)
            val value=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            require(value.keys==setOf("version","suite","contentAlgorithm","hpkeMode","author","context","nonce","ciphertext","recipients"))
            require(value["author"]!!.jsonObject.keys==setOf("role","keyId"))
            require(value["context"]!!.jsonObject.keys==setOf("workspaceId","accountId","objectId","revision","domain"))
            value["recipients"]!!.jsonArray.forEach { require(it.jsonObject.keys==setOf("role","keyId","publicKey","encapsulatedKey","wrappedKey")) }
            return Wire.decodeFromString(bytes.toString(Charsets.UTF_8))
        }
    }
}
