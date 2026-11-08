package com.ridesharetaxpros.driver.core

import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Test

class ProtectedEnrollmentTest {
    private fun key()=KeyPairGenerator.getInstance("EC").apply {initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    private fun recipient(key:KeyPair)=protectedPublicBytes(key.public as ECPublicKey).let {ProtectedRecipient(protectedKeyID(it),protectedEncode(it))}
    private val signer=key()
    private val client=recipient(key())
    private val recovery=recipient(key())
    private val pins=ProtectedPins(1,"https://workspace.example.com","workspace-1",recipient(signer).publicKey,recovery.publicKey)
    private val identity=ProtectedIdentity("account-1","client-1")
    private val clock=Instant.parse("2026-11-07T12:00:00Z")
    private fun signed(manifest:ProtectedManifest=ProtectedManifest(1,"manifest-1",pins.workspaceId,identity.accountId,identity.clientId,1,client,recovery,
        "2026-11-07T11:00:00Z","2026-11-08T12:00:00Z",ProtectedSignature("ES256-P1363",pins.signerKeyID,""))):ProtectedManifest {
        val raw=Signature.getInstance("SHA256withECDSAinP1363Format").run {initSign(signer.private);update(manifest.canonicalBytes());sign()}
        return manifest.copy(signature=manifest.signature.copy(value=protectedEncode(raw)))
    }
    @Test fun p256ManifestRoundTripsAndVerifiesItsIndependentTrustRoots() {
        val approved=signed()
        val restored=ProtectedManifest.decode(Wire.encodeToString(approved).toByteArray())
        restored.verify(ProtectedPins.decode(Wire.encodeToString(pins).toByteArray()),identity,client,clock)
        assertEquals(approved,restored)
        assertTrue(approved.canonicalBytes().toString(Charsets.UTF_8).startsWith("[1,\"shuug/secure-tax-manifest\","))
    }
    @Test fun tamperingAccountDeviceOrRecoveryCannotReuseAnApproval() {
        val approved=signed()
        assertTrue(runCatching {approved.copy(epoch=2).verify(pins,identity,client,clock)}.isFailure)
        assertTrue(runCatching {approved.verify(pins,identity.copy(accountId="another-account"),client,clock)}.isFailure)
        assertTrue(runCatching {approved.verify(pins,identity,recipient(key()),clock)}.isFailure)
        assertTrue(runCatching {approved.copy(firmRecovery=recipient(key())).verify(pins,identity,client,clock)}.isFailure)
    }
    @Test fun expiredFutureAndUnknownFieldDocumentsFailClosed() {
        val approved=signed()
        assertTrue(runCatching {approved.verify(pins,identity,client,clock.plusSeconds(86401))}.isFailure)
        assertTrue(runCatching {signed(approved.copy(issuedAt="2026-11-07T12:01:01Z")).verify(pins,identity,client,clock)}.isFailure)
        val extra=Wire.encodeToString(approved).dropLast(1)+",\"extra\":true}"
        assertTrue(runCatching {ProtectedManifest.decode(extra.toByteArray())}.isFailure)
        val extraPin=Wire.encodeToString(pins).dropLast(1)+",\"extra\":true}"
        assertTrue(runCatching {ProtectedPins.decode(extraPin.toByteArray())}.isFailure)
    }
    @Test fun nonCanonicalEncodingAndInvalidCurvePointsAreRejected() {
        assertTrue(runCatching {protectedDecode(client.publicKey+"=",65)}.isFailure)
        assertTrue(runCatching {protectedPublicKey(byteArrayOf(4)+ByteArray(64))}.isFailure)
        assertTrue(runCatching {pins.copy(firmRecoveryPublicKey=pins.signerPublicKey).validate()}.isFailure)
        assertTrue(runCatching {pins.copy(workspaceOrigin="https://workspace.example.com/redirect").validate()}.isFailure)
    }
}
