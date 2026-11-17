package com.ridesharetaxpros.driver.core

import java.io.File
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Actual JS implementation, disposable keys and captured stdout only. No production state. */
class ClientOnlyJavaScriptInteropTest {
    private val cli=System.getenv("GIGTAX_CLIENT_ONLY_INTEROP_CLI")?.let(::File)
        ?: File("../../../packages/secure-tax-client/client-only-interop.mjs")
    private fun javascript(mode:String,input:JsonObject?=null):JsonObject {
        val process=ProcessBuilder("node",cli.canonicalPath,mode).start()
        try {
            process.outputStream.use {if(input!=null)it.write(input.toString().toByteArray(Charsets.UTF_8))}
            val output=process.inputStream.readBytes();require(output.size<=1024*1024)
            assertTrue("Synthetic JavaScript interoperability timed out",process.waitFor(20,TimeUnit.SECONDS))
            assertEquals("Synthetic JavaScript interoperability failed",0,process.exitValue())
            return Wire.parseToJsonElement(output.toString(Charsets.UTF_8)).jsonObject.also {assertTrue(it["syntheticOnly"]!!.jsonPrimitive.boolean)}
        } finally {if(process.isAlive)process.destroyForcibly()}
    }
    @Test fun realJavaScriptAndKotlinOpenEachOthersV3Ciphertext() {
        assumeTrue("Provide the repository's synthetic client-only interoperability CLI.",cli.isFile)
        val fixture=javascript("fixture")
        val hpke=ProtectedEnvelope.hpke()
        val public=fixture["clientPublicKey"]!!.jsonPrimitive.content
        val private=protectedDecode(fixture["clientPrivateKey"]!!.jsonPrimitive.content,32)
        val pair=try {hpke.deserializePrivateKey(private,protectedDecode(public,65))} finally {private.fill(0)}
        val local=ProtectedRecipient(protectedKeyID(protectedDecode(public,65)),public)
        val trusted=ProtectedEnvelope.Trusted.clientOnly(local)
        val pins=ProtectedPins.decode(fixture["nativePins"]!!.toString().toByteArray())
        val manifest=ProtectedManifest.decode(fixture["manifest"]!!.toString().toByteArray())
        manifest.verify(pins,ProtectedIdentity("synthetic-account","synthetic-client"),local,Instant.parse(fixture["generatedAt"]!!.jsonPrimitive.content))
        val context=Wire.decodeFromJsonElement<ProtectedEnvelope.Context>(fixture["context"]!!)
        val plaintext=ProtectedEnvelope.decodeBounded(fixture["plaintext"]!!.jsonPrimitive.content,1,65536)
        val jsEnvelope=ProtectedEnvelope.decode(fixture["envelope"]!!.toString().toByteArray())
        assertArrayEquals(plaintext,jsEnvelope.open(context,trusted,"client",pair))
        for(prefix in listOf("unrelatedFirm","signer")) {
            val scalar=protectedDecode(fixture["${prefix}PrivateKey"]!!.jsonPrimitive.content,32)
            val wrong=try {hpke.deserializePrivateKey(scalar,protectedDecode(fixture["${prefix}PublicKey"]!!.jsonPrimitive.content,65))} finally {scalar.fill(0)}
            assertTrue(runCatching {jsEnvelope.open(context,trusted,"client",wrong)}.isFailure)
        }
        val kotlin=ProtectedEnvelope.seal(plaintext,context,trusted,"client",pair)
        val input=buildJsonObject {
            put("syntheticOnly",true);put("context",fixture["context"]!!);put("clientPublicKey",public)
            put("clientPrivateKey",fixture["clientPrivateKey"]!!);put("envelope",Wire.encodeToJsonElement(kotlin))
        }
        val opened=javascript("open",input)
        assertArrayEquals(plaintext,ProtectedEnvelope.decodeBounded(opened["plaintext"]!!.jsonPrimitive.content,1,65536))
        plaintext.fill(0)
    }
}
