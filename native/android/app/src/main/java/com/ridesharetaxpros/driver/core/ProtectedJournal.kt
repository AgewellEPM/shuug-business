package com.ridesharetaxpros.driver.core

import java.time.Instant
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.bouncycastle.crypto.AsymmetricCipherKeyPair

@Serializable data class ProtectedJournalScope(val workspaceOrigin:String,val workspaceId:String,val identity:ProtectedIdentity) {
    fun validate(pins:ProtectedPins) {
        pins.validate();validateProtectedID(identity.accountId);validateProtectedID(identity.clientId)
        require(workspaceOrigin==pins.workspaceOrigin && workspaceId==pins.workspaceId) { "The protected archive belongs to another independently trusted workspace." }
    }
    val storageID get()=protectedKeyID(buildJsonArray {
        add(1);add("shuug/secure-tax-device-key");add(workspaceOrigin);add(workspaceId);add(identity.accountId);add(identity.clientId)
    }.toString().toByteArray(Charsets.UTF_8))
}
fun protectedSnapshotID(value:String) { require(runCatching { UUID.fromString(value).toString()==value }.getOrDefault(false)) { "A protected archive must use its opaque random UUID." } }
fun protectedCanonical(value:JsonElement):JsonElement=when(value) {
    is JsonObject->JsonObject(value.toSortedMap().mapValues { protectedCanonical(it.value) })
    is JsonArray->JsonArray(value.map(::protectedCanonical))
    else->value
}
fun protectedJournalHash(journal:Journal):String=protectedKeyID(protectedCanonical(Wire.encodeToJsonElement(journal)).toString().toByteArray(Charsets.UTF_8))

/** Keeps the actual native JSON intact. This is a preview archive, never an import. */
@Serializable data class ProtectedJournalSnapshot(val version:Int=1,val type:String="driver-journal",val binding:Binding,val capturedAt:Long,val journal:JsonObject) {
    @Serializable data class Binding(val workspaceId:String,val accountId:String,val clientId:String,val objectId:String)
    fun encoded():ByteArray=protectedCanonical(Wire.encodeToJsonElement(this)).toString().toByteArray(Charsets.UTF_8).also {
        require(it.size<=ProtectedEnvelope.MAX_CIPHERTEXT-16) { "This journal exceeds the encrypted snapshot size limit. Keep its local records and attachments." }
    }
    fun seal(revision:Int,trusted:ProtectedEnvelope.Trusted,key:AsymmetricCipherKeyPair)=ProtectedEnvelope.seal(encoded(),
        ProtectedEnvelope.Context(binding.workspaceId,binding.accountId,binding.objectId,revision,"driver-state"),trusted,"client",key)
    companion object {
        // Both supported native archives retain their own fields. We do not silently
        // decode a foreign Journal into Android defaults or provide restore/apply.
        private val fields=setOf("version","cursor","entries","receipts","activeTripId","tracker","lastSyncAt","goals","bankTransactions","placePrompts","assistance","bankCursor","bankUpdatedAt","mission","pickupWaits","reserveSettings","missionOffers","driverAlerts","observedOffers","gigOffers","gigDecisions","gigCommitments","gigOfferLogs","coachMessages","coachOutbox","coachIntake","coachIntakeMutationId","coachMilestones","coachEngine","universalGigSettings","reputationState","reputationOutbox",
            "waitSamples","vehicleReservePercent","taxReservePercent","offerReader","tripAlerts","offerReviews","universalWorkProfiles")
        fun binding(scope:ProtectedJournalScope,id:String):Binding { protectedSnapshotID(id);return Binding(scope.workspaceId,scope.identity.accountId,scope.identity.clientId,id) }
        fun capture(value:Journal,scope:ProtectedJournalScope,id:String,clock:Instant=Instant.now()):ProtectedJournalSnapshot {
            require(value.version==1) { "This journal version cannot be archived by this app." }
            return ProtectedJournalSnapshot(binding=binding(scope,id),capturedAt=clock.toEpochMilli(),journal=Wire.encodeToJsonElement(value).jsonObject).also { it.encoded() }
        }
        fun decode(bytes:ByteArray,expected:Binding):ProtectedJournalSnapshot {
            require(bytes.size<=ProtectedEnvelope.MAX_CIPHERTEXT-16)
            val value=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            require(value.keys==setOf("version","type","binding","capturedAt","journal") && value["binding"]!!.jsonObject.keys==setOf("workspaceId","accountId","clientId","objectId")) { "This protected snapshot uses an unsupported format. Its original bytes were kept." }
            val body=value["journal"]!!.jsonObject
            require(body.keys.all { it in fields }) { "This protected journal contains future fields and must be opened by a compatible app." }
            val snapshot=Wire.decodeFromString<ProtectedJournalSnapshot>(bytes.toString(Charsets.UTF_8))
            require(snapshot.version==1 && snapshot.type=="driver-journal" && snapshot.binding==expected && body["version"]?.jsonPrimitive?.intOrNull==1) { "The snapshot type, account, client or journal version does not match this request." }
            protectedSnapshotID(snapshot.binding.objectId);Instant.ofEpochMilli(snapshot.capturedAt)
            for(name in listOf("entries","receipts")) {
                val rows=body[name]?.jsonArray ?: error("The protected journal is missing its $name metadata.")
                val ids=rows.map { row->if(name=="entries") row.jsonObject["record"]!!.jsonObject["id"]!!.jsonPrimitive.content else row.jsonObject["id"]!!.jsonPrimitive.content }
                ids.forEach { require(runCatching { UUID.fromString(it) }.isSuccess) { "The protected journal has an invalid record identity." } }
                require(ids.toSet().size==ids.size) { "The protected journal has duplicate $name identities." }
            }
            return snapshot
        }
        fun open(envelope:ProtectedEnvelope,scope:ProtectedJournalScope,id:String,revision:Int,trusted:ProtectedEnvelope.Trusted,key:AsymmetricCipherKeyPair):ProtectedJournalSnapshot {
            val expected=ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,id,revision,"driver-state")
            return decode(envelope.open(expected,trusted,"client",key),binding(scope,id))
        }
    }
}
@Serializable data class ProtectedSnapshotUpload(val mutationId:String,val expectedRevision:Int,val journalSHA256:String,val envelope:ProtectedEnvelope)
@Serializable data class ProtectedObjectReceipt(val objectId:String,val revision:Int,val sequence:Long,val deleted:Boolean,val duplicate:Boolean?=null) {
    fun validate() { protectedSnapshotID(objectId);require(revision in 1..1_000_000_001 && sequence in 1..9_007_199_254_740_991) { "The protected workspace returned invalid revision metadata." } }
}
@Serializable data class ProtectedObjectPage(val changes:List<ProtectedObjectReceipt>,val cursor:Long,val hasMore:Boolean) {
    fun validate(after:Long,limit:Int) {
        require(after in 0..9_007_199_254_740_991 && limit in 1..200 && changes.size<=limit && cursor==(changes.lastOrNull()?.sequence ?: after) && (!hasMore || changes.isNotEmpty()))
        var previous=after;changes.forEach { it.validate();require(it.sequence>previous) { "The protected workspace cursor moved backwards." };previous=it.sequence }
    }
}
@Serializable data class ProtectedStoredObject(val objectId:String,val revision:Int,val sequence:Long,val deleted:Boolean,val envelope:ProtectedEnvelope?=null) {
    fun validate(id:String,scope:ProtectedJournalScope) {
        ProtectedObjectReceipt(objectId,revision,sequence,deleted).validate()
        require(id==objectId && deleted==(envelope==null)) { "The encrypted object differs from the requested archive." }
        envelope?.context?.let { require(it.workspaceId==scope.workspaceId && it.accountId==scope.identity.accountId && it.objectId==id && it.revision==revision) { "The encrypted object belongs to another account or revision." } }
    }
}
@Serializable data class ProtectedJournalCheckpoint(val version:Int=1,val scope:ProtectedJournalScope,val objectId:String=uuid(),val revision:Int=0,val sequence:Long=0,
    val acknowledgedJournalSHA256:String?=null,val pending:ProtectedSnapshotUpload?=null,val deleted:Boolean=false) {
    fun validate(expected:ProtectedJournalScope) {
        require(version==1 && scope==expected && revision in 0..1_000_000_001 && sequence in 0..9_007_199_254_740_991) { "This archive checkpoint belongs to another account or unsupported version." }
        protectedSnapshotID(objectId);acknowledgedJournalSHA256?.let { protectedDecode(it,32) }
        pending?.let {
            protectedSnapshotID(it.mutationId);protectedDecode(it.journalSHA256,32)
            require(!deleted && it.expectedRevision==revision && revision<1_000_000_000 && it.envelope.context==ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,objectId,revision+1,"driver-state")) { "The encrypted retry no longer matches its saved account and revision." }
        }
    }
    fun prepared(journal:Journal,trusted:ProtectedEnvelope.Trusted,key:AsymmetricCipherKeyPair,clock:Instant=Instant.now()):ProtectedJournalCheckpoint {
        validate(scope);require(!deleted && revision<1_000_000_000) { "This archive was deleted or reached its revision limit." }
        if(pending!=null) return this
        val snapshot=ProtectedJournalSnapshot.capture(journal,scope,objectId,clock)
        return copy(pending=ProtectedSnapshotUpload(uuid(),revision,protectedJournalHash(journal),snapshot.seal(revision+1,trusted,key)))
    }
    fun acknowledged(receipt:ProtectedObjectReceipt,mutationId:String):ProtectedJournalCheckpoint {
        validate(scope);receipt.validate();val upload=pending ?: error("No encrypted upload is waiting for confirmation.")
        require(upload.mutationId==mutationId && receipt.objectId==objectId && receipt.revision==upload.expectedRevision+1 && !receipt.deleted && receipt.sequence>sequence) { "The workspace acknowledgment differs from this exact pending snapshot." }
        return copy(revision=receipt.revision,sequence=receipt.sequence,acknowledgedJournalSHA256=upload.journalSHA256,pending=null)
    }
    fun deleted(receipt:ProtectedObjectReceipt):ProtectedJournalCheckpoint {
        validate(scope);receipt.validate()
        require(pending==null && receipt.objectId==objectId && receipt.deleted && receipt.revision in revision..revision+1 && receipt.sequence>=sequence) { "The workspace deletion does not match this archive revision." }
        return copy(revision=receipt.revision,sequence=receipt.sequence,acknowledgedJournalSHA256=null,pending=null,deleted=true)
    }
}
data class ProtectedJournalImportReview(val snapshot:ProtectedJournalSnapshot,val localJournalSHA256:String,val missingReceiptIDs:List<String>,val notes:List<String>) {
    fun stillMatches(journal:Journal)=protectedJournalHash(journal)==localJournalSHA256
    companion object {
        fun prepare(snapshot:ProtectedJournalSnapshot,current:Journal,available:Set<String>):ProtectedJournalImportReview {
            val missing=snapshot.journal["receipts"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }.filterNot { it in available }
            val notes=mutableListOf("This candidate does not replace or merge the current Journal.","Historical route files and receipt contents are separate encrypted objects; this snapshot contains receipt metadata only.","Device permissions, capture sessions and notifications are not restored or replayed.","Native iPhone and Android journal formats retain their own fields. Cross-platform preview does not promise a compatible restore.")
            if(snapshot.journal["activeTripId"]!=null || snapshot.journal["tracker"]!=null) notes+="The source has an active or interrupted drive. Review it without starting or resuming a drive on this device."
            if(snapshot.journal["assistance"]!=null || snapshot.journal["driverAlerts"]?.jsonArray?.isNotEmpty()==true || snapshot.journal["tripAlerts"]?.jsonArray?.isNotEmpty()==true) notes+="Assistance preferences and alert history require review; reading history must not trigger old device actions."
            if(missing.isNotEmpty()) notes+="Some referenced receipt files are unavailable locally. Preserve their source and recover them separately."
            return ProtectedJournalImportReview(snapshot,protectedJournalHash(current),missing,notes)
        }
    }
}
