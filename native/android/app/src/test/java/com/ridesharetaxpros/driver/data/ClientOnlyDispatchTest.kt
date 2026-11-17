package com.ridesharetaxpros.driver.data

import com.ridesharetaxpros.driver.core.*
import java.io.File
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class ClientOnlyDispatchTest {
    private val pins=ProtectedPins.decode(File("src/main/assets/SecureTaxTrustedPins.json").readBytes())
    private val scope=ProtectedJournalScope(pins.workspaceOrigin,pins.workspaceId,ProtectedIdentity("synthetic-account","synthetic-client"),pins.profile)
    private val hpke=ProtectedEnvelope.hpke()
    private val pair=hpke.generatePrivateKey()
    private val firm=hpke.generatePrivateKey()
    private fun recipient(pair:org.bouncycastle.crypto.AsymmetricCipherKeyPair)=hpke.serializePublicKey(pair.public).let {ProtectedRecipient(protectedKeyID(it),protectedEncode(it))}
    private val trusted=ProtectedEnvelope.Trusted.clientOnly(recipient(pair))
    private val connection=Connection(pins.workspaceOrigin,LoginReply(1,"a".repeat(64),"2026-11-18T12:00:00Z",ClientAccount(scope.identity.accountId,"Synthetic",""),WorkspaceBrand("Synthetic","#000000","#ffffff")),AccountAccess.PRIVATE,scope.identity.clientId,pins.profile)
    @Test fun actualObjectClientRejectsLegacyAndExtraSlotsBeforeCallingTransport()=runBlocking {
        var calls=0
        val client=ProtectedObjectClient(WorkspaceClient(connection),scope,pins,{trusted}) {path,method,body->
            calls++;assertTrue(path.startsWith("client-only/objects/"));assertEquals("PUT",method)
            val envelope=Wire.parseToJsonElement(body!!.toString(Charsets.UTF_8)).jsonObject["envelope"]!!.jsonObject
            assertEquals(3,envelope["version"]!!.jsonPrimitive.int)
            Wire.encodeToString(ProtectedObjectReceipt(path.substringAfterLast('/'),1,1,false)).toByteArray()
        }
        val legacyScope=scope.copy(profile=null)
        val legacy=ProtectedJournalCheckpoint(scope=legacyScope).prepared(Journal(),ProtectedEnvelope.Trusted(recipient(pair),recipient(firm)),pair)
        try {client.put(legacy.pending!!);fail("Legacy pending request reached the transport")}catch(_:IllegalArgumentException) {}
        assertEquals(0,calls)
        val fresh=ProtectedJournalCheckpoint(scope=scope).prepared(Journal(),trusted,pair)
        val upload=fresh.pending!!
        try {client.put(upload.copy(envelope=upload.envelope.copy(recipients=upload.envelope.recipients+upload.envelope.recipients.single())));fail("Extra slot reached transport")}catch(_:IllegalArgumentException) {}
        assertEquals(0,calls)
        client.put(upload);assertEquals(1,calls)
    }
    @Test fun actualHttpPolicyDeniesEveryLegacyPrivateMethodAndAcceptsNewCiphertext() {
        val config=File("src/main/assets/SecureTaxTrustedPins.json").readBytes()
        for(path in listOf("secure/status","secure/objects/${uuid()}","secure/native-session","secure/account","secure/social/start","driver/session")) {
            for(method in listOf("GET","POST","PUT","DELETE"))assertTrue("$method $path",runCatching {ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,path,method,null,config)}.isFailure)
        }
        for((path,body) in listOf(
            "driver/routes" to """{"origin":{"latitude":41.7,"longitude":-72.7},"destination":{"latitude":41.8,"longitude":-72.8},"alternatives":false}""",
            "driver/banks" to """{"action":"disconnect","itemId":"synthetic-item"}""",
            "driver/banks" to """{"action":"cancel","sessionId":"synthetic-session"}""")) {
            assertTrue("Legacy $path",runCatching {ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,path,"POST",body.toByteArray(),config)}.isFailure)
        }
        ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,"client-only/status","GET",null,config)
        ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,"client-only/native-session","POST","""{"accountCode":"00000000-0000-0000-0000-000000000001","password":"synthetic"}""".toByteArray(),config)
        val prepared=ProtectedJournalCheckpoint(scope=scope).prepared(Journal(),trusted,pair).pending!!
        val body=buildJsonObject {put("mutationId",prepared.mutationId);put("expectedRevision",prepared.expectedRevision);put("envelope",Wire.encodeToJsonElement(prepared.envelope))}.toString().toByteArray()
        ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,"client-only/objects/${prepared.envelope.context.objectId}","PUT",body,config)
        assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(pins.workspaceOrigin,"client-only/objects/${uuid()}","PUT",body,config)}.isFailure)
        assertTrue(runCatching {ProtectedTransportPolicy.requiresProtected(pins.workspaceOrigin,null)}.isFailure)
        assertTrue(runCatching {ProtectedTransportPolicy.requiresProtected(pins.workspaceOrigin,"{}".toByteArray())}.isFailure)
    }
    @Test fun mutableDiscoveryAndSavedOriginsCannotDowngradeTheBundledClientOnlyBuild()=runBlocking {
        val config=File("src/main/assets/SecureTaxTrustedPins.json").readBytes()
        val previous=ProtectedTransportPolicy.configurationSource
        ProtectedTransportPolicy.configurationSource={config}
        try {
            val alternate="https://untrusted-discovery.invalid"
            val original="""{"workspaceUrl":"${pins.workspaceOrigin}"}""".toByteArray()
            val changed="""{"workspaceUrl":"$alternate"}""".toByteArray()
            assertEquals(pins.workspaceOrigin,WorkspaceClient.discoveredOrigin(original))
            assertThrows(IllegalArgumentException::class.java) {WorkspaceClient.discoveredOrigin(changed)}
            assertThrows(IllegalArgumentException::class.java) {ProtectedTransportPolicy.requiresProtected(alternate,config)}
            // Exercise the shared real HTTP boundary for both discovered manual
            // addresses and previously saved sessions. It must reject before
            // URL connection/DNS, rather than merely protecting the old host.
            for(client in listOf(WorkspaceClient(address=alternate),WorkspaceClient(connection.copy(origin=alternate)))) {
                for(path in listOf("driver/session","driver/records","driver/profile","documents","secure/native-session","client-only/objects/${uuid()}")) {
                    for(method in listOf("GET","POST","PUT")) {
                        try {client.customer(path,method,"{}".toByteArray());fail("An unpinned origin reached HTTP dispatch")}
                        catch(error:IllegalArgumentException) {assertEquals(ProtectedTransportPolicy.CONFIGURATION_ERROR,error.message)}
                    }
                }
            }
        } finally {ProtectedTransportPolicy.configurationSource=previous}
    }
    @Test fun localAccountNamespaceSeparatesEveryProfileAndKeepsLegacyBytesAddressable() {
        val legacy=connection.copy(encryptionProfile=null)
        assertNotEquals(legacy.storageNamespace,connection.storageNamespace)
        assertEquals(PrivateStore.hash(connection.origin+"|"+connection.session.account.id),legacy.storageNamespace)
        assertNotEquals(connection.storageNamespace,connection.copy(session=connection.session.copy(account=connection.session.account.copy(id="other-account"))).storageNamespace)
    }
}
