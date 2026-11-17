package com.ridesharetaxpros.driver.core

import java.io.File
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class ClientOnlyProtectionTest {
    private val hpke=ProtectedEnvelope.hpke()
    private val client=hpke.generatePrivateKey()
    private val firm=hpke.generatePrivateKey()
    private val signer=KeyPairGenerator.getInstance("EC").apply {initialize(ECGenParameterSpec("secp256r1"))}.generateKeyPair()
    private fun recipient(pair:org.bouncycastle.crypto.AsymmetricCipherKeyPair)=hpke.serializePublicKey(pair.public).let {ProtectedRecipient(protectedKeyID(it),protectedEncode(it))}
    private val local=recipient(client)
    private val signerPublic=protectedEncode(protectedPublicBytes(signer.public as ECPublicKey))
    private val pins=ProtectedPins(2,"https://synthetic.invalid","synthetic-workspace",signerPublic,profile=ProtectedProfile.CLIENT_ONLY)
    private val scope=ProtectedJournalScope(pins.workspaceOrigin,pins.workspaceId,ProtectedIdentity("synthetic-account","synthetic-client"),pins.profile)
    private val trusted=ProtectedEnvelope.Trusted.clientOnly(local)
    private val context=ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,"d121e508-8e51-44fc-a63c-70bd5045b8cc",1,"driver-state")
    private val now=Instant.parse("2026-11-17T12:00:00Z")
    private fun manifest(recipient:ProtectedRecipient=local,epoch:Int=1,clientId:String=scope.identity.clientId):ProtectedManifest {
        val value=ProtectedManifest(2,"synthetic-manifest",scope.workspaceId,scope.identity.accountId,clientId,epoch,
            recipient,issuedAt="2026-11-17T11:00:00Z",expiresAt="2026-11-18T12:00:00Z",signature=ProtectedSignature("ES256-P1363",pins.signerKeyID,""),profile=pins.profile)
        val signature=Signature.getInstance("SHA256withECDSAinP1363Format").run {initSign(signer.private);update(value.canonicalBytes());sign()}
        return value.copy(signature=value.signature.copy(value=protectedEncode(signature)))
    }
    private fun rejected(block:()->Unit) {assertTrue(runCatching(block).isFailure)}

    @Test fun soleClientCanOpenButOwnerAndSignerCannot() {
        val plaintext="Synthetic private client-only record".toByteArray()
        val envelope=ProtectedEnvelope.seal(plaintext,context,trusted,"client",client)
        assertEquals(3,envelope.version);assertEquals(ProtectedProfile.CLIENT_ONLY,envelope.profile)
        assertEquals(listOf("client"),envelope.recipients.map {it.role})
        assertArrayEquals(plaintext,envelope.open(context,trusted,"client",client))
        rejected {envelope.open(context,trusted,"client",firm)}
        val signerAgreement=hpke.deserializePrivateKey((signer.private as java.security.interfaces.ECPrivateKey).s.toByteArray().takeLast(32).toByteArray().let {ByteArray(32-it.size)+it},protectedDecode(signerPublic,65))
        rejected {envelope.open(context,trusted,"client",signerAgreement)}
        rejected {envelope.open(context,trusted,"firm-recovery",firm)}
        rejected {ProtectedEnvelope.seal(plaintext,context,trusted,"firm-recovery",firm)}
        assertEquals(envelope,ProtectedEnvelope.decode(Wire.encodeToString(envelope).toByteArray()))
        val expected=buildJsonArray {
            add(3);add("gigtax/client-only-envelope");add(ProtectedProfile.CLIENT_ONLY);add("driver-state")
            add(scope.workspaceId);add(scope.identity.accountId);add(context.objectId);add(1)
            add("AES-256-GCM");add("HPKE-P256-SHA256-A256GCM");add("auth")
            repeat(2) {add(buildJsonArray {add("client");add(local.keyId)})}
        }
        assertEquals(expected.toString(),ProtectedEnvelope.header(context,envelope.author,trusted).toString(Charsets.UTF_8))
    }
    @Test fun extraSlotsWrongContextsAndLegacyFormatsAreDenied() {
        val envelope=ProtectedEnvelope.seal("synthetic".toByteArray(),context,trusted,"client",client)
        rejected {envelope.copy(recipients=envelope.recipients+envelope.recipients.single().copy(role="firm-recovery")).open(context,trusted,"client",client)}
        rejected {ProtectedEnvelope.decode(Wire.encodeToString(envelope.copy(recipients=envelope.recipients+envelope.recipients.single())).toByteArray())}
        rejected {envelope.copy(author=envelope.author.copy(role="firm-recovery")).open(context,trusted,"client",client)}
        rejected {envelope.copy(profile="owner-recovery").open(context,trusted,"client",client)}
        rejected {envelope.open(context.copy(accountId="other-account"),trusted,"client",client)}
        val legacy=ProtectedEnvelope.seal("synthetic".toByteArray(),context,ProtectedEnvelope.Trusted(local,recipient(firm)),"client",client)
        rejected {legacy.open(context,trusted,"client",client)}
        rejected {ProtectedEnvelope.decode((Wire.encodeToString(envelope).dropLast(1)+",\"firmRecovery\":null}").toByteArray())}
        rejected {ProtectedEnvelope.decode(Wire.encodeToString(envelope.copy(profile=null)).toByteArray())}
    }
    @Test fun signedManifestCannotSubstituteLocalKeyOrAddRecovery() {
        val approved=manifest()
        val decoded=ProtectedManifest.decode(Wire.encodeToString(approved).toByteArray())
        decoded.verify(pins,scope.identity,local,now)
        assertEquals(trusted.profile,decoded.trusted().profile)
        assertTrue(decoded.canonicalBytes().toString(Charsets.UTF_8).startsWith("[2,\"gigtax/client-only-manifest\",\"client-only-v1\","))
        rejected {manifest(recipient(firm),2).verify(pins,scope.identity,local,now)}
        rejected {manifest(ProtectedRecipient(pins.signerKeyID,pins.signerPublicKey)).verify(pins,scope.identity,ProtectedRecipient(pins.signerKeyID,pins.signerPublicKey),now)}
        rejected {approved.copy(firmRecovery=recipient(firm)).verify(pins,scope.identity,local,now)}
        rejected {ProtectedManifest.decode((Wire.encodeToString(approved).dropLast(1)+",\"firmRecovery\":null}").toByteArray())}
        rejected {approved.copy(version=1,profile=null,firmRecovery=recipient(firm)).verify(pins,scope.identity,local,now)}
        rejected {decoded.verify(pins,scope.identity.copy(accountId="other-account"),local,now)}
        rejected {decoded.verify(pins,scope.identity,local,now.plusSeconds(86401))}
        manifest(epoch=2).verify(pins,scope.identity,local,now)
    }
    @Test fun profileNamespacesDoNotReuseLegacyAcknowledgmentsOrRetries() {
        val legacyScope=scope.copy(profile=null)
        assertNotEquals(legacyScope.storageID,scope.storageID)
        val journal=Journal(goals=Goals(dailyNetCents=10000))
        val legacy=ProtectedJournalCheckpoint(scope=legacyScope,objectId=context.objectId).prepared(journal,ProtectedEnvelope.Trusted(local,recipient(firm)),client)
        rejected {legacy.validate(scope)}
        rejected {legacy.copy(scope=scope).validate(scope)}
        rejected {legacy.copy(scope=scope).prepared(journal,trusted,client)}
        val acknowledged=legacy.acknowledged(ProtectedObjectReceipt(legacy.objectId,1,1,false),legacy.pending!!.mutationId)
        rejected {acknowledged.validate(scope)}
        val fresh=ProtectedJournalCheckpoint(scope=scope).prepared(journal,trusted,client)
        assertNotNull(fresh.pending);assertEquals(3,fresh.pending!!.envelope.version)
        assertNotEquals(legacy.objectId,fresh.objectId)
        assertEquals(acknowledged.acknowledgedJournalSHA256,fresh.pending!!.journalSHA256)
        val receipt=LocalReceipt(mime="application/pdf")
        val prepared=ProtectedReceiptCheckpoint.prepare(scope,receipt,"%PDF-Synthetic".toByteArray(),trusted,client)
        assertEquals(3,prepared.envelope.version)
        rejected {prepared.copy(envelope=legacy.pending!!.envelope).validate(scope,receipt.id)}
    }
    @Test fun immutableLocalBindingRejectsOwnerSubstitutionAndRollbackAfterKeyFileLoss() {
        val approved=manifest()
        val anchor=ProtectedClientBinding.first(scope,approved,pins,local,now)
        val restored=Wire.decodeFromString<ProtectedClientBinding>(Wire.encodeToString(anchor))
        restored.validate(scope,local)
        val newer=restored.approve(manifest(epoch=2),pins,local,now)
        rejected {newer.approve(approved,pins,local,now)}
        rejected {newer.approve(manifest(recipient(firm),3),pins,recipient(firm),now)}
        rejected {newer.validate(scope.copy(profile=null),local)}
        rejected {newer.validate(scope.copy(identity=scope.identity.copy(accountId="different-account")),local)}
        rejected {newer.approve(manifest(epoch=2).copy(manifestId="changed"),pins,local,now)}
        assertEquals(2,newer.highestEpoch)
        assertEquals(newer,newer.approve(manifest(epoch=2),pins,local,now))
    }
    @Test fun accountAnchorLookupSurvivesServerClientIdChangeAndRejectsSignedReplacement() {
        val replacementScope=scope.copy(identity=scope.identity.copy(clientId="changed-client"))
        assertEquals(scope.accountBindingID,replacementScope.accountBindingID)
        assertNotEquals(scope.storageID,replacementScope.storageID)
        assertNotEquals(scope.accountBindingID,scope.copy(identity=scope.identity.copy(accountId="different-account")).accountBindingID)
        assertNotEquals(scope.accountBindingID,scope.copy(workspaceId="different-workspace").accountBindingID)
        assertNotEquals(scope.accountBindingID,scope.copy(workspaceOrigin="https://another.invalid").accountBindingID)
        val anchor=ProtectedClientBinding.first(scope,manifest(),pins,local,now)
        val restored=Wire.decodeFromString<ProtectedClientBinding>(Wire.encodeToString(anchor))
        rejected {restored.validate(replacementScope,local)}
        // This is a fresh valid owner signature with the identical key. It
        // cannot turn a changed clientId into a new local account authority.
        val ownerSigned=manifest(epoch=2,clientId=replacementScope.identity.clientId)
        ownerSigned.verify(pins,replacementScope.identity,local,now)
        rejected {restored.approve(ownerSigned,pins,local,now)}
        rejected {restored.approve(manifest(recipient(firm),2,replacementScope.identity.clientId),pins,recipient(firm),now)}
    }
    @Test fun productionPinsContainOnlyClientOnlyProfileAndSigningAuthority() {
        val file=File("src/main/assets/SecureTaxTrustedPins.json")
        assertTrue(file.isFile)
        val bundled=ProtectedPins.decode(file.readBytes())
        assertEquals(ProtectedProfile.GIGTAX_ORIGIN,bundled.workspaceOrigin)
        assertTrue(bundled.clientOnly);assertNull(bundled.firmRecoveryPublicKey)
        assertEquals("client-only",bundled.apiPrefix)
        assertEquals(setOf("version","profile","workspaceOrigin","workspaceId","signerPublicKey"),Wire.parseToJsonElement(file.readText()).jsonObject.keys)
        rejected {ProtectedPins.decode(file.readText().replace("client-only-v1","future-profile").toByteArray())}
        rejected {bundled.copy(version=1,profile=null,firmRecoveryPublicKey=recipient(firm).publicKey).validate()}
    }
}
