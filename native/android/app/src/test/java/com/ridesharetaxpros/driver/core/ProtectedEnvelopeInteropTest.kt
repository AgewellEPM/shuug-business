package com.ridesharetaxpros.driver.core

import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Runs against the actual iOS CryptoKit implementation compiled as a synthetic CLI. */
class ProtectedEnvelopeInteropTest {
    private val binary=File("/private/tmp/gigtax-protected-envelope-swift-proof")
    private fun native(mode:String,input:JsonObject?=null):JsonObject {
        val process=ProcessBuilder(binary.path,mode).start()
        try {
            process.outputStream.use { stream->if(input!=null) stream.write(input.toString().toByteArray(Charsets.UTF_8)) }
            assertTrue("Synthetic CryptoKit proof timed out",process.waitFor(20,TimeUnit.SECONDS))
            assertEquals("Synthetic CryptoKit proof rejected interoperability input",0,process.exitValue())
            val output=process.inputStream.readBytes();require(output.size<=24*1024*1024)
            return Wire.parseToJsonElement(output.toString(Charsets.UTF_8)).jsonObject
        } finally { if(process.isAlive) process.destroyForcibly() }
    }
    @Test fun cryptoKitAndKotlinAuthenticateBothDirectionsAndBothRecipients() {
        assumeTrue("Compile SecureTaxEnvelope.swift + native-secure-tax-envelope-proof.swift to run the native interoperability proof.",binary.canExecute())
        val fixture=native("fixture");assertTrue(fixture["syntheticOnly"]!!.jsonPrimitive.boolean)
        val hpke=ProtectedEnvelope.hpke()
        val clientPublic=fixture["clientPublicKey"]!!.jsonPrimitive.content
        val firmPublic=fixture["firmRecoveryPublicKey"]!!.jsonPrimitive.content
        val client=hpke.deserializePrivateKey(protectedDecode(fixture["clientPrivateKey"]!!.jsonPrimitive.content,32),protectedDecode(clientPublic,65))
        val firm=hpke.deserializePrivateKey(protectedDecode(fixture["firmRecoveryPrivateKey"]!!.jsonPrimitive.content,32),protectedDecode(firmPublic,65))
        val trusted=ProtectedEnvelope.Trusted(ProtectedRecipient(protectedKeyID(protectedDecode(clientPublic,65)),clientPublic),ProtectedRecipient(protectedKeyID(protectedDecode(firmPublic,65)),firmPublic))
        val context=Wire.decodeFromJsonElement<ProtectedEnvelope.Context>(fixture["context"]!!)
        val plaintext=ProtectedEnvelope.decodeBounded(fixture["plaintext"]!!.jsonPrimitive.content,1,ProtectedEnvelope.MAX_CIPHERTEXT-16)
        val swiftEnvelope=ProtectedEnvelope.decode(fixture["envelope"]!!.toString().toByteArray(Charsets.UTF_8))
        assertArrayEquals("Kotlin client must open actual CryptoKit bytes",plaintext,swiftEnvelope.open(context,trusted,"client",client))
        assertArrayEquals("Kotlin recovery recipient must open actual CryptoKit bytes",plaintext,swiftEnvelope.open(context,trusted,"firm-recovery",firm))
        for((authorRole,authorKey) in listOf("client" to client,"firm-recovery" to firm)) {
            val kotlin=ProtectedEnvelope.seal(plaintext,context,trusted,authorRole,authorKey)
            for((role,privateField) in listOf("client" to "clientPrivateKey","firm-recovery" to "firmRecoveryPrivateKey")) {
                val input=buildJsonObject {
                    put("syntheticOnly",true);put("context",fixture["context"]!!)
                    put("clientPublicKey",clientPublic);put("firmRecoveryPublicKey",firmPublic)
                    put("envelope",Wire.encodeToJsonElement(kotlin));put("role",role);put("privateKey",fixture[privateField]!!)
                }
                val opened=native("open",input)
                assertTrue(opened["ok"]!!.jsonPrimitive.boolean)
                assertArrayEquals("CryptoKit $role must open Kotlin $authorRole authored content",plaintext,ProtectedEnvelope.decodeBounded(opened["plaintext"]!!.jsonPrimitive.content,1,ProtectedEnvelope.MAX_CIPHERTEXT-16))
            }
        }
    }
}
