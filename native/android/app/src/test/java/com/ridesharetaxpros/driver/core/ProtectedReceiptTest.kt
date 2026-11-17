package com.ridesharetaxpros.driver.core

import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class ProtectedReceiptTest {
    @Test fun durableReceiptRetryUsesBrowserReadableCiphertextAndBothIndependentKeys() {
        val hpke=ProtectedEnvelope.hpke();val client=hpke.generatePrivateKey();val firm=hpke.generatePrivateKey()
        fun public(pair:org.bouncycastle.crypto.AsymmetricCipherKeyPair)=protectedEncode(hpke.serializePublicKey(pair.public))
        fun recipient(pair:org.bouncycastle.crypto.AsymmetricCipherKeyPair)=ProtectedRecipient(protectedKeyID(hpke.serializePublicKey(pair.public)),public(pair))
        val scope=ProtectedJournalScope("https://synthetic.invalid","synthetic-workspace",ProtectedIdentity("synthetic-account","synthetic-client"))
        val bytes="%PDF-1.4\nSynthetic receipt bytes only\n%%EOF".toByteArray()
        val receipt=LocalReceipt(mime="application/pdf")
        val prepared=ProtectedReceiptCheckpoint.prepare(scope,receipt,bytes,ProtectedEnvelope.Trusted(recipient(client),recipient(firm)),client)
        val restored=Wire.decodeFromString<ProtectedReceiptCheckpoint>(Wire.encodeToString(prepared));assertEquals(prepared,restored)
        assertFalse(Wire.encodeToString(prepared).contains("Synthetic receipt"))
        assertThrows(Exception::class.java) {prepared.validate(scope.copy(identity=scope.identity.copy(accountId="other-account")),receipt.id)}
        assertThrows(Exception::class.java) {prepared.acknowledged(ProtectedObjectReceipt(uuid(),1,1,false))}
        val acknowledged=prepared.acknowledged(ProtectedObjectReceipt(prepared.objectId,1,1,false));assertEquals(prepared.envelope,acknowledged.envelope)
        val fixture=buildJsonObject {
            put("syntheticOnly",true);put("clientPublicKey",public(client));put("firmRecoveryPublicKey",public(firm))
            put("clientPrivateKey",protectedEncode(hpke.serializePrivateKey(client.private)));put("firmRecoveryPrivateKey",protectedEncode(hpke.serializePrivateKey(firm.private)))
            put("envelope",Wire.encodeToJsonElement(restored.envelope))
        }
        val process=ProcessBuilder("node",File("../verification/open-private-receipt-proof.mjs").canonicalPath).start()
        try {
            process.outputStream.use {it.write(fixture.toString().toByteArray())};assertTrue(process.waitFor(30,TimeUnit.SECONDS));assertEquals(0,process.exitValue())
            val opened=Wire.parseToJsonElement(process.inputStream.readBytes().toString(Charsets.UTF_8)).jsonObject
            assertTrue(opened["bothRecipientsOpened"]!!.jsonPrimitive.boolean)
            val payload=opened["payload"]!!.jsonObject
            assertArrayEquals(bytes,protectedDecode(payload["data"]!!.jsonPrimitive.content,bytes.size));assertEquals("receipt-${receipt.id}.pdf",payload["filename"]!!.jsonPrimitive.content)
        } finally {if(process.isAlive)process.destroyForcibly()}
    }
}
