package com.ridesharetaxpros.driver.data

import com.ridesharetaxpros.driver.core.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

/** Ciphertext and retry metadata only; the live journal remains a separate file. */
class ProtectedJournalCheckpointStore(private val storage:PrivateStore,private val namespace:String,private val scope:ProtectedJournalScope) {
    private val filename="protected-journal-"+PrivateStore.hash(scope.storageID)+".json"
    fun load():ProtectedJournalCheckpoint?=synchronized(storage) {
        storage.read(namespace,filename)?.let { bytes->
            require(bytes.size<=24*1024*1024) { "The saved protected retry exceeds its size limit." }
            Wire.decodeFromString<ProtectedJournalCheckpoint>(bytes.toString(Charsets.UTF_8)).also { it.validate(scope) }
        }
    }
    fun create():ProtectedJournalCheckpoint=synchronized(storage) { load() ?: ProtectedJournalCheckpoint(scope=scope).also { write(it) } }
    private fun write(value:ProtectedJournalCheckpoint) {
        value.validate(scope);val bytes=Wire.encodeToString(value).toByteArray(Charsets.UTF_8)
        require(bytes.size<=24*1024*1024) { "The protected retry exceeds its supported size limit." };storage.write(namespace,filename,bytes)
    }
    fun save(next:ProtectedJournalCheckpoint,expected:ProtectedJournalCheckpoint)=synchronized(storage) {
        val current=load()
        require(current==expected && next.objectId==expected.objectId && next.scope==scope) { "The local protected archive changed during this operation. Its newer state was kept." }
        write(next)
    }
    fun startNewAfterDeletion():ProtectedJournalCheckpoint=synchronized(storage) {
        val old=load() ?: error("No protected archive has been deleted.")
        require(old.deleted && old.pending==null) { "Only an explicitly deleted remote archive can start a new archive ID." }
        ProtectedJournalCheckpoint(scope=scope).also { write(it) }
    }
}

interface ProtectedObjectTransport {
    suspend fun changes(after:Long,limit:Int=100):ProtectedObjectPage
    suspend fun item(id:String):ProtectedStoredObject
    suspend fun put(upload:ProtectedSnapshotUpload):ProtectedObjectReceipt
    suspend fun delete(id:String,revision:Int):ProtectedObjectReceipt
}
/** Only the authenticated ciphertext envelope and required CAS metadata leave the phone. */
class ProtectedObjectClient(private val client:WorkspaceClient,private val scope:ProtectedJournalScope,private val pins:ProtectedPins):ProtectedObjectTransport {
    init { scope.validate(pins);require(client.connection?.origin==pins.workspaceOrigin) }
    override suspend fun changes(after:Long,limit:Int):ProtectedObjectPage {
        require(after in 0..9_007_199_254_740_991 && limit in 1..200)
        return Wire.decodeFromString<ProtectedObjectPage>(client.customer("secure/objects?after=$after&limit=$limit",maximum=65536).toString(Charsets.UTF_8)).also { it.validate(after,limit) }
    }
    override suspend fun item(id:String):ProtectedStoredObject {
        protectedSnapshotID(id)
        val bytes=client.customer("secure/objects/$id",maximum=24*1024*1024)
        val raw=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
        (raw["envelope"] as? JsonObject)?.let { ProtectedEnvelope.decode(it.toString().toByteArray(Charsets.UTF_8)) }
        return Wire.decodeFromString<ProtectedStoredObject>(bytes.toString(Charsets.UTF_8)).also { it.validate(id,scope) }
    }
    override suspend fun put(upload:ProtectedSnapshotUpload):ProtectedObjectReceipt {
        protectedSnapshotID(upload.mutationId)
        val context=upload.envelope.context;protectedSnapshotID(context.objectId)
        require(upload.expectedRevision in 0 until 1_000_000_000 && upload.envelope.version==2 && context==ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,context.objectId,upload.expectedRevision+1,"driver-state"))
        val body=buildJsonObject { put("mutationId",upload.mutationId);put("expectedRevision",upload.expectedRevision);put("envelope",Wire.encodeToJsonElement(upload.envelope)) }.toString().toByteArray(Charsets.UTF_8)
        require(body.size<=24*1024*1024)
        return Wire.decodeFromString<ProtectedObjectReceipt>(client.customer("secure/objects/${context.objectId}","PUT",body,maximum=65536).toString(Charsets.UTF_8)).also {
            it.validate();require(it.objectId==context.objectId && it.revision==context.revision && !it.deleted) { "The workspace did not acknowledge this exact protected archive." }
        }
    }
    override suspend fun delete(id:String,revision:Int):ProtectedObjectReceipt {
        protectedSnapshotID(id);require(revision in 1..1_000_000_001)
        val body=buildJsonObject { put("expectedRevision",revision) }.toString().toByteArray(Charsets.UTF_8)
        return Wire.decodeFromString<ProtectedObjectReceipt>(client.customer("secure/objects/$id","DELETE",body,maximum=65536).toString(Charsets.UTF_8)).also {
            it.validate();require(it.objectId==id && it.deleted && it.revision in revision..revision+1) { "The workspace did not confirm deletion of this archive." }
        }
    }
}
@Serializable private data class ProtectedJournalStatus(val enrolled:Boolean,val keyProvisioningEnabled:Boolean,val identity:ProtectedIdentity,val manifest:ProtectedManifest?=null)
data class ProtectedJournalUploadOutcome(val receipt:ProtectedObjectReceipt,val localJournalStillMatches:Boolean)
/** Explicit archive workflow, with no enrollment, live-journal apply or plaintext fallback. */
class ProtectedJournalService private constructor(private val repo:DriverRepository,val scope:ProtectedJournalScope,private val pins:ProtectedPins) {
    private val namespace=repo.scope
    private val connection=repo.connection ?: error("Connect the invited client account first.")
    private val key=ProtectedDeviceKeyStore(repo.app,scope,pins)
    private fun requireCurrent() {
        require(repo.scope==namespace && repo.connection==connection) { "Your account or session changed. Reopen Protected Journal." }
        key.requireUnlocked()
    }
    private val client=WorkspaceClient(connection)
    private val objects:ProtectedObjectTransport=ProtectedObjectClient(client,scope,pins)
    private val checkpoints=ProtectedJournalCheckpointStore(repo.store,namespace,scope)
    private val lock=Mutex()
    private suspend fun authorize() {
        requireCurrent();require(repo.storageReady) { "The saved local Journal could not be opened. Keep this installation; an empty replacement will not be uploaded." }
        val local=key.state()?.stagedManifest ?: error("This device has no verified signed enrollment for this account.")
        val bytes=client.customer("secure/status",maximum=65536)
        requireCurrent()
        val raw=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
        val remote=ProtectedManifest.decode((raw["manifest"] as? JsonObject ?: error("Your device approval is staged, but encrypted workspace enrollment is not activated.")).toString().toByteArray(Charsets.UTF_8))
        val status=Wire.decodeFromString<ProtectedJournalStatus>(bytes.toString(Charsets.UTF_8))
        require(status.enrolled && status.keyProvisioningEnabled && status.identity==scope.identity && remote.canonicalBytes().contentEquals(local.canonicalBytes())) { "Encrypted snapshots need matching verified device approval and active workspace enrollment. No plaintext fallback is available." }
        remote.verify(pins,scope.identity,local.client)
    }
    fun checkpoint():ProtectedJournalCheckpoint? { requireCurrent();return checkpoints.load() }
    suspend fun upload(captured:Journal):ProtectedJournalUploadOutcome=lock.withLock {
        authorize();val original=checkpoints.create()
        val prepared=key.withClientPrivateKey { pair,trusted->original.prepared(captured,trusted,pair) }
        checkpoints.save(prepared,original)
        val upload=prepared.pending!!;val receipt=objects.put(upload);requireCurrent()
        val current=checkpoints.load() ?: error("The local protected checkpoint is unavailable; keep this installation.")
        require(current.pending?.mutationId==upload.mutationId)
        val next=current.acknowledged(receipt,upload.mutationId);checkpoints.save(next,current)
        ProtectedJournalUploadOutcome(receipt,next.acknowledgedJournalSHA256==protectedJournalHash(repo.journal))
    }
    suspend fun changes(after:Long,limit:Int=100):ProtectedObjectPage=lock.withLock { authorize();objects.changes(after,limit).also { requireCurrent() } }
    suspend fun preview(id:String,minimumRevision:Int):ProtectedJournalSnapshot=lock.withLock {
        require(minimumRevision in 1..1_000_000_000);authorize();val item=objects.item(id);requireCurrent()
        require(!item.deleted && item.envelope!=null && item.revision>=minimumRevision) { "The workspace returned a deleted or older protected item." }
        checkpoints.load()?.takeIf { it.objectId==id }?.let { require(!it.deleted && item.revision>=it.revision) { "The workspace returned an older archive than this phone already acknowledged." } }
        key.withClientPrivateKey { pair,trusted->ProtectedJournalSnapshot.open(item.envelope,scope,id,item.revision,trusted,pair) }
    }
    fun prepareImport(snapshot:ProtectedJournalSnapshot,availableReceipts:Set<String>):ProtectedJournalImportReview {
        requireCurrent();require(snapshot.binding==ProtectedJournalSnapshot.binding(scope,snapshot.binding.objectId))
        return ProtectedJournalImportReview.prepare(snapshot,repo.journal,availableReceipts)
    }
    suspend fun deleteOwn():ProtectedObjectReceipt=lock.withLock {
        authorize();val old=checkpoints.load() ?: error("No remote archive is saved for this phone.")
        require(old.revision>0 && !old.deleted && old.pending==null) { "Resolve the pending encrypted upload before deleting its remote archive." }
        val receipt=objects.delete(old.objectId,old.revision);requireCurrent();checkpoints.save(old.deleted(receipt),old);receipt
    }
    suspend fun startNewArchive()=lock.withLock { requireCurrent();checkpoints.startNewAfterDeletion() }
    companion object {
        suspend fun configure(repo:DriverRepository):ProtectedJournalService {
            require(repo.storageReady) { "The local Journal could not be opened. Keep this installation and its saved records." }
            val namespace=repo.scope;val connection=repo.connection ?: error("Connect your invited client account first.")
            val pins=repo.app.assets.open("SecureTaxTrustedPins.json").use { ProtectedPins.decode(boundedRead(it,16384)) }
            require(connection.origin==pins.workspaceOrigin) { "The connected workspace differs from this signed app's independent public pins." }
            val bytes=WorkspaceClient(connection).customer("secure/status",maximum=65536)
            require(repo.scope==namespace && repo.connection==connection)
            val status=Wire.decodeFromString<ProtectedJournalStatus>(bytes.toString(Charsets.UTF_8))
            require(status.identity.accountId==connection.session.account.id && status.enrolled==(status.manifest!=null))
            val scope=ProtectedJournalScope(pins.workspaceOrigin,pins.workspaceId,status.identity).also { it.validate(pins) }
            return ProtectedJournalService(repo,scope,pins).also { it.authorize() }
        }
    }
}
