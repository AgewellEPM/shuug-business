package com.ridesharetaxpros.driver.core

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.bouncycastle.crypto.hpke.HPKE

class ProtectedJournalTest {
    private val hpke=ProtectedEnvelope.hpke()
    private val client=hpke.generatePrivateKey();private val firm=hpke.generatePrivateKey();private val stranger=hpke.generatePrivateKey()
    private fun recipient(pair:org.bouncycastle.crypto.AsymmetricCipherKeyPair):ProtectedRecipient {
        val bytes=hpke.serializePublicKey(pair.public);return ProtectedRecipient(protectedKeyID(bytes),protectedEncode(bytes))
    }
    private val trusted=ProtectedEnvelope.Trusted(recipient(client),recipient(firm))
    private val scope=ProtectedJournalScope("https://synthetic.invalid","synthetic-workspace",ProtectedIdentity("synthetic-account","synthetic-client"))
    private val context=ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,"d121e508-8e51-44fc-a63c-70bd5045b8cc",1,"driver-state")
    private val plaintext="{\"syntheticOnly\":true,\"message\":\"SYNTHETIC PRIVATE ARCHIVE\"}".toByteArray()
    private fun seal()=ProtectedEnvelope.seal(plaintext,context,trusted,"client",client)
    private fun changed(encoded:String):String=protectedEncode(java.util.Base64.getUrlDecoder().decode(encoded).also { it[0]=(it[0].toInt() xor 1).toByte() })
    private fun rejected(work:()->Unit) { assertTrue(runCatching(work).isFailure) }
    @Test fun bothIndependentRecipientsAndFirmAuthoredContentOpen() {
        val sealed=seal()
        assertArrayEquals(plaintext,sealed.open(context,trusted,"client",client))
        assertArrayEquals(plaintext,sealed.open(context,trusted,"firm-recovery",firm))
        val firmAuthored=ProtectedEnvelope.seal(plaintext,context,trusted,"firm-recovery",firm)
        assertArrayEquals(plaintext,firmAuthored.open(context,trusted,"client",client))
        assertArrayEquals(plaintext,firmAuthored.open(context,trusted,"firm-recovery",firm))
    }
    @Test fun framingAndBothRecoverySlotsAreAuthenticated() {
        val sealed=seal()
        val json=Wire.encodeToString(sealed)
        assertFalse(json.contains("SYNTHETIC PRIVATE ARCHIVE"));assertFalse(json.contains("privateKey"))
        assertEquals(sealed,ProtectedEnvelope.decode(json.toByteArray()))
        rejected { sealed.copy(version=1).open(context,trusted,"client",client) }
        rejected { sealed.copy(hpkeMode="base").open(context,trusted,"client",client) }
        rejected { sealed.copy(ciphertext=changed(sealed.ciphertext)).open(context,trusted,"client",client) }
        rejected { sealed.copy(nonce=changed(sealed.nonce)).open(context,trusted,"client",client) }
        // The client does not use the recovery slot to unwrap, but its content AAD
        // must still detect tampering that would break separate firm recovery.
        val slots=sealed.recipients.mapIndexed { i,slot->if(i==1) slot.copy(wrappedKey=changed(slot.wrappedKey)) else slot }
        rejected { sealed.copy(recipients=slots).open(context,trusted,"client",client) }
        rejected { sealed.copy(recipients=sealed.recipients.reversed()).open(context,trusted,"client",client) }
    }
    @Test fun roleAccountRevisionAndAuthorSubstitutionFail() {
        val sealed=seal()
        rejected { sealed.open(context,trusted,"client",stranger) }
        rejected { sealed.open(context,trusted,"firm-recovery",client) }
        rejected { ProtectedEnvelope.seal(plaintext,context,trusted,"client",stranger) }
        rejected { sealed.open(context.copy(accountId="other-account"),trusted,"client",client) }
        val moved=context.copy(revision=2)
        rejected { sealed.copy(context=moved).open(moved,trusted,"client",client) }
        rejected { sealed.copy(author=ProtectedEnvelope.Author("firm-recovery",trusted.firmRecovery.keyId)).open(context,trusted,"client",client) }
    }
    @Test fun baseModeRelabeledAsAuthCannotImpersonateTrustedAuthor() {
        val author=ProtectedEnvelope.Author("client",trusted.client.keyId)
        val aad=ProtectedEnvelope.header(context,author,trusted);val contentKey=ByteArray(32) { (it+1).toByte() }
        val base=HPKE(HPKE.mode_base,HPKE.kem_P256_SHA256,HPKE.kdf_HKDF_SHA256,HPKE.aead_AES_GCM256)
        val slots=listOf("client" to trusted.client,"firm-recovery" to trusted.firmRecovery).map { (role,pin)->
            val sender=base.setupBaseS(base.deserializePublicKey(protectedDecode(pin.publicKey,65)),"shuug/secure-tax-envelope/v2".toByteArray())
            ProtectedEnvelope.Slot(role,pin.keyId,pin.publicKey,protectedEncode(sender.encapsulation),protectedEncode(sender.seal(aad,contentKey)))
        }
        val nonce=ByteArray(12) { it.toByte() }
        val ciphertext=Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE,SecretKeySpec(contentKey,"AES"),GCMParameterSpec(128,nonce));updateAAD(ProtectedEnvelope.contentHeader(aad,slots));doFinal(plaintext)
        }
        val forged=ProtectedEnvelope(author=author,context=context,nonce=protectedEncode(nonce),ciphertext=protectedEncode(ciphertext),recipients=slots)
        rejected { forged.open(context,trusted,"client",client) }
        rejected { forged.open(context,trusted,"firm-recovery",firm) }
    }
    @Test fun checkpointKeepsCiphertextRetryAcrossLaterLocalChanges() {
        val journal=Journal(goals=Goals(dailyNetCents=10000))
        val original=ProtectedJournalCheckpoint(scope=scope,objectId=context.objectId)
        val prepared=original.prepared(journal,trusted,client,Instant.parse("2026-11-07T12:00:00Z"))
        val restored=Wire.decodeFromString<ProtectedJournalCheckpoint>(Wire.encodeToString(prepared))
        val newer=journal.copy(goals=Goals(dailyNetCents=20000))
        assertEquals(prepared,restored.prepared(newer,trusted,client))
        val pending=prepared.pending!!
        val acknowledged=prepared.acknowledged(ProtectedObjectReceipt(context.objectId,1,1,false),pending.mutationId)
        assertEquals(protectedJournalHash(journal),acknowledged.acknowledgedJournalSHA256)
        assertNotEquals(protectedJournalHash(newer),acknowledged.acknowledgedJournalSHA256)
        assertNull(acknowledged.pending)
        assertEquals(journal.goals.dailyNetCents,10000)
    }
    @Test fun staleOrWrongAcknowledgmentsNeverAdvanceCheckpoint() {
        val prepared=ProtectedJournalCheckpoint(scope=scope,objectId=context.objectId).prepared(Journal(),trusted,client)
        val pending=prepared.pending!!
        val good=ProtectedObjectReceipt(context.objectId,1,5,false)
        rejected { prepared.acknowledged(good,uuid()) }
        rejected { prepared.acknowledged(good.copy(revision=2),pending.mutationId) }
        rejected { prepared.acknowledged(good.copy(sequence=0),pending.mutationId) }
        rejected { prepared.acknowledged(good.copy(deleted=true),pending.mutationId) }
        val acknowledged=prepared.acknowledged(good,pending.mutationId)
        val second=acknowledged.prepared(Journal(),trusted,client)
        rejected { second.acknowledged(good.copy(revision=2),second.pending!!.mutationId) }
        rejected { prepared.deleted(good.copy(deleted=true)) }
        val tombstone=acknowledged.deleted(good.copy(revision=2,sequence=6,deleted=true))
        assertTrue(tombstone.deleted);assertNull(tombstone.pending)
        rejected { tombstone.prepared(Journal(),trusted,client) }
        assertEquals(0,prepared.revision)
    }
    @Test fun capturePreservesFullNativeJournalAndReviewCannotRestoreActions() {
        val receipt=LocalReceipt(mime="image/jpeg")
        val journal=Journal(receipts=listOf(receipt),activeTripId=uuid(),goals=Goals(vehicleCostCentsPerMile=50.0),coachMessages=listOf(CoachMessage(role="user",text="Synthetic question")),reputationState=ReputationState())
        val snapshot=ProtectedJournalSnapshot.capture(journal,scope,context.objectId)
        val envelope=snapshot.seal(1,trusted,client)
        val opened=ProtectedJournalSnapshot.open(envelope,scope,context.objectId,1,trusted,client)
        assertEquals(protectedCanonical(Wire.encodeToJsonElement(journal)),protectedCanonical(opened.journal))
        val review=ProtectedJournalImportReview.prepare(opened,journal,emptySet())
        assertEquals(listOf(receipt.id),review.missingReceiptIDs);assertTrue(review.stillMatches(journal))
        assertFalse(review.stillMatches(journal.copy(goals=Goals())))
        assertTrue(review.notes.any { it.contains("without starting or resuming") })
        assertEquals(journal.activeTripId,opened.journal["activeTripId"]!!.jsonPrimitive.content)
    }
    @Test fun futureFieldsDuplicateIdentitiesAndWrongBindingsFailBeforePreview() {
        val journal=Journal(entries=listOf(LocalEntry(DriverRecord.income(Income(description="Synthetic",amountCents=100)))))
        val value=ProtectedJournalSnapshot.capture(journal,scope,context.objectId)
        rejected { ProtectedJournalSnapshot.decode(value.encoded(),value.binding.copy(clientId="another-client")) }
        rejected { ProtectedJournalSnapshot.decode(value.copy(type="unrelated-type").encoded(),value.binding) }
        val future=value.copy(journal=JsonObject(value.journal+mapOf("futurePrivateFeature" to JsonPrimitive("preserve"))))
        rejected { ProtectedJournalSnapshot.decode(future.encoded(),value.binding) }
        val duplicate=value.copy(journal=Wire.encodeToJsonElement(journal.copy(entries=journal.entries+journal.entries)).jsonObject)
        rejected { ProtectedJournalSnapshot.decode(duplicate.encoded(),value.binding) }
    }
    @Test fun pagingRequiresStrictlyIncreasingSafeIntegerCursor() {
        val row=ProtectedObjectReceipt(context.objectId,1,9,false)
        ProtectedObjectPage(listOf(row),9,false).validate(0,100)
        rejected { ProtectedObjectPage(listOf(row,row),9,false).validate(0,100) }
        rejected { ProtectedObjectPage(emptyList(),9,true).validate(9,100) }
        rejected { ProtectedObjectPage(listOf(row),8,false).validate(0,100) }
        rejected { row.copy(sequence=9_007_199_254_740_992).validate() }
    }
}
