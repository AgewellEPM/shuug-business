package com.ridesharetaxpros.driver.core

import java.math.BigInteger
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.json.*
import org.bouncycastle.asn1.sec.SECNamedCurves
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.util.PrivateKeyFactory

/** Imports the independently delivered browser's encrypted backup, entirely locally. */
object PortableClientKeyBackup {
    class Opened(val recipient:ProtectedRecipient,val pkcs8:ByteArray):AutoCloseable {
        override fun close() {pkcs8.fill(0)}
    }
    private fun exact(value:JsonObject,keys:Set<String>) {require(value.keys==keys) {"Unsupported encrypted client-key backup."}}
    fun open(bytes:ByteArray,passphrase:CharArray):Opened {
        require(bytes.size in 1..8192 && passphrase.size in 16..1024) {"Choose your encrypted client-key backup and its separate backup passphrase."}
        val value=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
        exact(value,setOf("version","type","keyId","publicKey","kdf","cipher"))
        val kdf=value["kdf"]!!.jsonObject;val cipher=value["cipher"]!!.jsonObject
        exact(kdf,setOf("name","hash","iterations","salt"));exact(cipher,setOf("name","nonce","ciphertext"))
        require(value["version"]?.jsonPrimitive?.intOrNull==1 && value["type"]?.jsonPrimitive?.content=="shuug-client-key-backup" &&
            kdf["name"]?.jsonPrimitive?.content=="PBKDF2" && kdf["hash"]?.jsonPrimitive?.content=="SHA-256" &&
            kdf["iterations"]?.jsonPrimitive?.intOrNull==600000 && cipher["name"]?.jsonPrimitive?.content=="AES-256-GCM") {"Unsupported encrypted client-key backup."}
        val recipient=ProtectedRecipient(value["keyId"]!!.jsonPrimitive.content,value["publicKey"]!!.jsonPrimitive.content)
        val public=protectedDecode(recipient.publicKey,65);protectedPublicKey(public)
        require(protectedKeyID(public)==recipient.keyId) {"The backup public key fingerprint does not match."}
        val salt=protectedDecode(kdf["salt"]!!.jsonPrimitive.content,16);val nonce=protectedDecode(cipher["nonce"]!!.jsonPrimitive.content,12)
        val wrapped=ProtectedEnvelope.decodeBounded(cipher["ciphertext"]!!.jsonPrimitive.content,32,1024)
        val aad=buildJsonArray {add(1);add("shuug-client-key-backup");add(recipient.keyId);add(recipient.publicKey)}.toString().toByteArray(Charsets.UTF_8)
        val spec=PBEKeySpec(passphrase,salt,600000,256)
        val wrapping=try {SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded} finally {spec.clearPassword()}
        val privateBytes=try {
            Cipher.getInstance("AES/GCM/NoPadding").run {init(Cipher.DECRYPT_MODE,SecretKeySpec(wrapping,"AES"),GCMParameterSpec(128,nonce));updateAAD(aad);doFinal(wrapped)}
        } catch(_:Exception) {error("The encrypted client-key backup or passphrase is invalid.")}
        finally {wrapping.fill(0)}
        try {
            val key=PrivateKeyFactory.createKey(privateBytes) as? ECPrivateKeyParameters ?: error("The backup must contain a P-256 client key.")
            val curve=SECNamedCurves.getByName("secp256r1")
            require(key.parameters.curve==curve.curve && key.parameters.g==curve.g && key.parameters.n==curve.n && key.d>BigInteger.ZERO && key.d<curve.n)
            require(key.parameters.g.multiply(key.d).normalize().getEncoded(false).contentEquals(public)) {"The backup private key does not match its public key."}
            return Opened(recipient,privateBytes)
        } catch(failure:Exception) {privateBytes.fill(0);throw failure}
    }
}
