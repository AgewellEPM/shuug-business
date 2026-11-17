package com.ridesharetaxpros.driver.core

import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class PortableClientKeyBackupTest {
    private fun fixture():JsonObject {
        val helper=File("../verification/browser-key-backup-proof.mjs")
        val process=ProcessBuilder("node",helper.canonicalPath).start()
        try {
            assertTrue(process.waitFor(30,TimeUnit.SECONDS));assertEquals(0,process.exitValue())
            return Wire.parseToJsonElement(process.inputStream.readBytes().toString(Charsets.UTF_8)).jsonObject.also {assertTrue(it["syntheticOnly"]!!.jsonPrimitive.boolean)}
        } finally {if(process.isAlive)process.destroyForcibly()}
    }
    @Test fun opensActualWebCryptoBackupAndRejectsTamperingAndWrongPassphrase() {
        val fixture=fixture();val backup=fixture["backup"]!!.jsonObject
        val password=fixture["passphrase"]!!.jsonPrimitive.content.toCharArray()
        PortableClientKeyBackup.open(backup.toString().toByteArray(),password).use {
            assertEquals(backup["keyId"]!!.jsonPrimitive.content,it.recipient.keyId);assertTrue(it.pkcs8.isNotEmpty())
            val bytes=it.pkcs8;it.close();assertTrue(bytes.all {b->b==0.toByte()})
        }
        assertThrows(Exception::class.java) {PortableClientKeyBackup.open(backup.toString().toByteArray(),"Incorrect synthetic password".toCharArray())}
        val cipher=backup["cipher"]!!.jsonObject
        val encrypted=protectedDecode(cipher["ciphertext"]!!.jsonPrimitive.content,java.util.Base64.getUrlDecoder().decode(cipher["ciphertext"]!!.jsonPrimitive.content).size)
        encrypted[encrypted.lastIndex]=(encrypted.last().toInt() xor 1).toByte()
        val altered=JsonObject(backup+mapOf("cipher" to JsonObject(cipher+mapOf("ciphertext" to JsonPrimitive(protectedEncode(encrypted))))))
        assertThrows(Exception::class.java) {PortableClientKeyBackup.open(altered.toString().toByteArray(),password)}
        val weakened=JsonObject(backup+mapOf("kdf" to JsonObject(backup["kdf"]!!.jsonObject+mapOf("iterations" to JsonPrimitive(1)))))
        assertThrows(Exception::class.java) {PortableClientKeyBackup.open(weakened.toString().toByteArray(),password)}
        password.fill('\u0000')
    }
}
