package com.ridesharetaxpros.driver.core

import java.math.BigInteger
import java.net.URI
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.time.Instant
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

fun protectedEncode(bytes:ByteArray):String=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
fun protectedDecode(value:String,length:Int):ByteArray {
    require(value.matches(Regex("[A-Za-z0-9_-]+"))) {"The public key encoding is invalid."}
    val decoded=Base64.getUrlDecoder().decode(value)
    require(decoded.size==length && protectedEncode(decoded)==value) {"The public key encoding is invalid."};return decoded
}
fun protectedKeyID(bytes:ByteArray)=protectedEncode(MessageDigest.getInstance("SHA-256").digest(bytes))
fun validateProtectedID(value:String) {require(value.matches(Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"))) {"The protected workspace identity is invalid."}}
fun protectedPublicKey(bytes:ByteArray):ECPublicKey {
    require(bytes.size==65 && bytes[0]==4.toByte()) {"The P-256 public key is invalid."}
    val parameters=AlgorithmParameters.getInstance("EC").apply {init(ECGenParameterSpec("secp256r1"))}.getParameterSpec(ECParameterSpec::class.java)
    val point=ECPoint(BigInteger(1,bytes.copyOfRange(1,33)),BigInteger(1,bytes.copyOfRange(33,65)))
    val prime=(parameters.curve.field as java.security.spec.ECFieldFp).p
    require(point.affineX<prime && point.affineY<prime && point.affineY.modPow(BigInteger.valueOf(2),prime)==
        (point.affineX.modPow(BigInteger.valueOf(3),prime)+parameters.curve.a*point.affineX+parameters.curve.b).mod(prime)) {"The P-256 public key is not on the trusted curve."}
    return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(point,parameters)) as ECPublicKey
}
fun protectedPublicBytes(key:ECPublicKey):ByteArray {
    fun fixed(value:BigInteger)=value.toByteArray().takeLast(32).toByteArray().let {ByteArray(32-it.size)+it}
    return byteArrayOf(4)+fixed(key.w.affineX)+fixed(key.w.affineY)
}
@Serializable data class ProtectedPins(val version:Int,val workspaceOrigin:String,val workspaceId:String,val signerPublicKey:String,val firmRecoveryPublicKey:String) {
    fun validate() {
        validateProtectedID(workspaceId);val uri=URI(workspaceOrigin)
        require(version==1 && uri.scheme=="https" && uri.host?.contains('.')==true && uri.rawUserInfo==null && uri.rawQuery==null && uri.rawFragment==null && uri.port==-1 && uri.path.isEmpty() && uri.toString()==workspaceOrigin) {"The app’s public encryption configuration is invalid."}
        protectedPublicKey(protectedDecode(signerPublicKey,65));protectedPublicKey(protectedDecode(firmRecoveryPublicKey,65))
        require(signerPublicKey!=firmRecoveryPublicKey) {"Signing and firm recovery must use separate public keys."}
    }
    val signerKeyID get()=protectedKeyID(protectedDecode(signerPublicKey,65))
    companion object {
        fun decode(bytes:ByteArray):ProtectedPins {
            require(bytes.size<=16384) {"The public encryption configuration exceeds its size limit."}
            val objectValue=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            require(objectValue.keys==setOf("version","workspaceOrigin","workspaceId","signerPublicKey","firmRecoveryPublicKey")) {"This public key document has an unsupported format."}
            return Wire.decodeFromString<ProtectedPins>(bytes.toString(Charsets.UTF_8)).also {it.validate()}
        }
    }
}
@Serializable data class ProtectedIdentity(val accountId:String,val clientId:String)
@Serializable data class ProtectedRecipient(val keyId:String,val publicKey:String)
@Serializable data class ProtectedSignature(val algorithm:String,val signerKeyId:String,val value:String)
@Serializable data class ProtectedManifest(val version:Int,val manifestId:String,val workspaceId:String,val accountId:String,val clientId:String,val epoch:Int,
    val client:ProtectedRecipient,val firmRecovery:ProtectedRecipient,val issuedAt:String,val expiresAt:String,val signature:ProtectedSignature) {
    fun canonicalBytes()=buildJsonArray {
        add(1);add("shuug/secure-tax-manifest");add(manifestId);add(workspaceId);add(accountId);add(clientId);add(epoch)
        add(client.keyId);add(client.publicKey);add(firmRecovery.keyId);add(firmRecovery.publicKey);add(issuedAt);add(expiresAt)
    }.toString().toByteArray(Charsets.UTF_8)
    fun verify(pins:ProtectedPins,identity:ProtectedIdentity,localClient:ProtectedRecipient,clock:Instant=Instant.now()) {
        pins.validate();listOf(manifestId,workspaceId,accountId,clientId,identity.accountId,identity.clientId).forEach(::validateProtectedID)
        require(version==1 && epoch in 1..1_000_000_000 && workspaceId==pins.workspaceId && accountId==identity.accountId && clientId==identity.clientId && client==localClient && signature.algorithm=="ES256-P1363" && signature.signerKeyId==pins.signerKeyID) {"The signed key enrollment does not match this account, workspace and device key."}
        val pub=protectedDecode(client.publicKey,65);protectedPublicKey(pub)
        require(client.keyId==protectedKeyID(pub) && firmRecovery.publicKey==pins.firmRecoveryPublicKey && firmRecovery.keyId==protectedKeyID(protectedDecode(pins.firmRecoveryPublicKey,65)) && client.keyId!=firmRecovery.keyId && client.keyId!=pins.signerKeyID) {"The signed key enrollment does not match the independently trusted public keys."}
        val pattern=Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z")
        require(issuedAt.length<=64 && expiresAt.length<=64 && issuedAt.matches(pattern) && expiresAt.matches(pattern)) {"The signed key enrollment dates are invalid."}
        val issued=Instant.parse(issuedAt);val expires=Instant.parse(expiresAt)
        require(issued<=clock.plusSeconds(60) && expires>clock && expires>issued) {"The signed key enrollment has expired or is not yet valid."}
        val raw=protectedDecode(signature.value,64)
        fun derInteger(bytes:ByteArray):ByteArray {var stripped=bytes.dropWhile {it==0.toByte()}.toByteArray();if(stripped.isEmpty())stripped=byteArrayOf(0);if(stripped[0].toInt() and 128!=0)stripped=byteArrayOf(0)+stripped;return byteArrayOf(2,stripped.size.toByte())+stripped}
        val parts=derInteger(raw.copyOfRange(0,32))+derInteger(raw.copyOfRange(32,64));val der=byteArrayOf(0x30,parts.size.toByte())+parts
        require(Signature.getInstance("SHA256withECDSA").run {initVerify(protectedPublicKey(protectedDecode(pins.signerPublicKey,65)));update(canonicalBytes());verify(der)}) {"The public key enrollment’s firm signature is invalid."}
    }
    companion object {
        fun decode(bytes:ByteArray):ProtectedManifest {
            require(bytes.size<=16384) {"The signed enrollment file exceeds its size limit."}
            val objectValue=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            require(objectValue.keys==setOf("version","manifestId","workspaceId","accountId","clientId","epoch","client","firmRecovery","issuedAt","expiresAt","signature")) {"This public key document has an unsupported format."}
            for(name in listOf("client","firmRecovery"))require(objectValue[name]!!.jsonObject.keys==setOf("keyId","publicKey"))
            require(objectValue["signature"]!!.jsonObject.keys==setOf("algorithm","signerKeyId","value"))
            return Wire.decodeFromString(bytes.toString(Charsets.UTF_8))
        }
    }
}
