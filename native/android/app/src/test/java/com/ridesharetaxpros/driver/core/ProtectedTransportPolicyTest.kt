package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test

class ProtectedTransportPolicyTest {
    private val configuration="""{"version":1,"workspaceOrigin":"https://workspace.example.com","workspaceId":"workspace-1","signerPublicKey":"independently-bundled-key","firmRecoveryPublicKey":"separate-recovery-key"}""".toByteArray()
    @Test fun onlyIndependentMatchingPinsRequireProtectionAndMalformedPinsFailClosed() {
        assertFalse(ProtectedTransportPolicy.requiresProtected("https://workspace.example.com",null))
        assertTrue(ProtectedTransportPolicy.requiresProtected("https://workspace.example.com",configuration))
        assertFalse(ProtectedTransportPolicy.requiresProtected("https://another.example.com",configuration))
        for(bytes in listOf(byteArrayOf(),"{}".toByteArray(),configuration.toString(Charsets.UTF_8).replace("https://workspace.example.com","http://workspace.example.com").toByteArray(),ByteArray(16385))) {
            assertTrue(runCatching {ProtectedTransportPolicy.requiresProtected("https://workspace.example.com",bytes)}.isFailure)
        }
    }
    @Test fun legacyUploadsCannotBeDowngradedBeforeEnrollment() {
        for(path in listOf("driver/records","driver/receipts/id","driver/profile","driver/coach","driver/reputation","driver/referrals","documents","connections/argyle/handoff","driver/banks")) {
            assertTrue(path,runCatching {ProtectedTransportPolicy.assertAllowed(true,path,"POST","{}".toByteArray())}.isFailure)
            ProtectedTransportPolicy.assertAllowed(false,path,"POST","{}".toByteArray())
            ProtectedTransportPolicy.assertAllowed(true,path,"GET")
        }
        ProtectedTransportPolicy.assertAllowed(true,"driver/session","POST")
        ProtectedTransportPolicy.assertAllowed(true,"driver/session","DELETE")
        ProtectedTransportPolicy.assertAllowed(true,"secure/objects/00000000-0000-0000-0000-000000000001","PUT")
        assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(true,"secure/objects/invalid","PUT")}.isFailure)
    }
    @Test fun bankDisconnectAndCancelAllowOnlyTheirExactMinimalPayloads() {
        for(payload in listOf("""{"action":"disconnect","itemId":"item-1"}""","""{"action":"cancel","sessionId":"session-1"}"""))ProtectedTransportPolicy.assertAllowed(true,"driver/banks","POST",payload.toByteArray())
        for(payload in listOf("""{"action":"sync","itemId":"item-1"}""","""{"action":"disconnect","itemId":"item-1","extra":"data"}""","""{"action":"disconnect","itemId":42}""","""{"action":"cancel","sessionId":""}"""))assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(true,"driver/banks","POST",payload.toByteArray())}.isFailure)
    }
    @Test fun operationalRoutesAllowOnlyTwoExplicitNumericEndpointsAndAlternatives() {
        val payload="""{"origin":{"latitude":41.7,"longitude":-72.7},"destination":{"latitude":41.8,"longitude":-72.8},"alternatives":false}"""
        ProtectedTransportPolicy.assertAllowed(true,"driver/routes","POST",payload.toByteArray())
        for(value in listOf(payload.replace("41.7","91"),payload.replace("41.7","\"41.7\""),payload.replace("false","\"false\""),
            payload.dropLast(1)+",\"accountId\":\"other\"}",payload.replace("\"latitude\":41.7","\"savedRoute\":[1,2]"),"{}"))
            assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(true,"driver/routes","POST",value.toByteArray())}.isFailure)
        assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(true,"driver/routes","POST",ByteArray(4097))}.isFailure)
        assertTrue(runCatching {ProtectedTransportPolicy.assertAllowed(true,"driver/records","POST",payload.toByteArray())}.isFailure)
    }
}
