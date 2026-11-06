package com.ridesharetaxpros.driver.data

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.tracking.DriveService
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

class DriverApplication: Application() { val repository by lazy { DriverRepository(this) } }
class DriverRepository(val app: Application) {
    val store=PrivateStore(app)
    private val jobs=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    var connection by mutableStateOf<Connection?>(null); private set
    var journal by mutableStateOf(Journal()); private set
    var failure by mutableStateOf<String?>(null)
    var storageReady by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var bankStatus by mutableStateOf<BankStatus?>(null); private set
    var rewards by mutableStateOf<JsonObject?>(null); private set
    var trackingStatus by mutableStateOf("Tracking is off")
    val scope get()=connection?.let { PrivateStore.hash(it.origin+"|"+it.session.account.id) } ?: "guest"
    init { try {
        connection=store.read("session","connection.json")?.let { Wire.decodeFromString<Connection>(it.toString(Charsets.UTF_8)) }
        journal=store.journal(scope); storageReady=true
        if(journal.activeTripId!=null) { update { it.markTrackingInterrupted() }; trackingStatus="A drive was interrupted. Resume tracking or end it below." }
    } catch(_: Exception) { failure="Saved data could not be opened. Keep this installation for recovery; recording is disabled." } }
    fun update(transform: (Journal)->Journal) {
        check(storageReady) { "Storage is unavailable." }; val next=transform(journal)
        try { store.save(scope,next); journal=next } catch(error: Exception) { storageReady=false; failure="Could not save your records. Recording has stopped; keep this installation for recovery."; throw error }
    }
    fun save(record: DriverRecord) {
        update { it.upsert(record) }
        if(connection!=null) run { sync() }
    }
    fun run(block: suspend ()->Unit) { jobs.launch { try { block() } catch(error: Exception) { failure=error.message ?: "The operation could not finish. Your records are kept." } } }
    suspend fun connect(address: String,email: String,password: String) {
        check(journal.activeTripId==null) { "End your current drive before switching accounts." }; check(storageReady)
        val origin=WorkspaceClient.origin(address); val reply=WorkspaceClient(address=origin).login(email.trim(),password)
        val next=Connection(origin,reply); val namespace=PrivateStore.hash(origin+"|"+reply.account.id)
        val saved=store.journal(namespace)
        store.write("session","connection.json",Wire.encodeToString(next).toByteArray())
        app.stopService(Intent(app,DriveService::class.java)); connection=next; journal=saved; rewards=null; bankStatus=null
        sync()
    }
    suspend fun disconnect() {
        check(journal.activeTripId==null) { "End your current drive before disconnecting." }
        connection?.let { WorkspaceClient(it).send("session","DELETE") }
        val guest=store.journal("guest")
        // An empty encrypted optional value is understood as signed out at next launch.
        store.clearConnection(); app.stopService(Intent(app,DriveService::class.java))
        connection=null; journal=guest; rewards=null; bankStatus=null
    }
    fun transferGuest() {
        check(connection!=null && journal.activeTripId==null); val guest=store.journal("guest"); check(guest.activeTripId==null)
        guest.receipts.forEach { store.saveReceipt(scope,it.id,store.receipt("guest",it.id)) }
        guest.entries.filter { it.record.kind=="trip" && journal.entries.none { old->old.record.id==it.record.id } }.forEach { store.copyRoute("guest",scope,it.record.id) }
        update { current -> var next=current
            guest.visible.forEach { entry -> if(next.entries.none { it.record.id==entry.record.id }) next=next.upsert(entry.record.copy(revision=0)) }
            next.copy(receipts=(next.receipts+guest.receipts.map { it.copy(uploaded=false) }).distinctBy { it.id },
                bankTransactions=mergeBank(next.bankTransactions,guest.bankTransactions),goals=guest.goals,assistance=guest.assistance,
                placePrompts=(next.placePrompts+guest.placePrompts).distinctBy { it.id }.takeLast(100),
                mission=next.mission ?: guest.mission,waitSamples=(next.waitSamples+guest.waitSamples).distinct().takeLast(1000),
                vehicleReservePercent=next.vehicleReservePercent ?: guest.vehicleReservePercent,taxReservePercent=next.taxReservePercent ?: guest.taxReservePercent) }
        // Keep the guest source as a recoverable copy; stable record IDs make repeats safe.
    }
    suspend fun sync() {
        val active=connection ?: return; if(busy) return; val namespace=scope; busy=true
        try {
            val client=WorkspaceClient(active)
            var passes=0
            do {
                passes++
                for(receipt in journal.pendingReceipts) {
                    client.send("receipts/"+receipt.id,"PUT",store.receipt(namespace,receipt.id),receipt.mime)
                    if(scope!=namespace) return
                    update { it.copy(receipts=it.receipts.map { item->if(item.id==receipt.id) item.copy(uploaded=true) else item }) }
                }
                for(entry in journal.pendingRecords) {
                    // A new edit can arrive while a request is in flight. Never post a stale
                    // snapshot or an expense whose newly attached receipt is still queued.
                    val current=journal.entries.firstOrNull { it.record.id==entry.record.id } ?: continue
                    if(current.pendingMutationId!=entry.pendingMutationId || current.conflict!=null || !journal.receiptReady(current.record)) continue
                    val mutation=Mutation(current.pendingMutationId!!,current.record)
                    try { val remote=client.save(mutation); if(scope!=namespace) return; update { it.acknowledge(mutation,remote) } }
                    catch(error: WorkspaceError) { if(error.status==409 && error.current!=null) { if(scope!=namespace) return; update { it.merge(error.current) } } else throw error }
                }
                do { val page=client.records(journal.cursor); if(scope!=namespace) return
                    update { current->page.records.fold(current) { state,row->state.merge(row) }.copy(cursor=page.cursor) }
                } while(page.hasMore)
                // Bounded passes flush edits made during network waits without an endless
                // retry loop. Failed requests leave the durable queue intact.
            } while(passes<20 && (journal.pendingReceipts.isNotEmpty() || journal.pendingRecords.isNotEmpty()))
            update { it.copy(lastSyncAt=now()) }
        } finally { busy=false }
    }
    suspend fun refreshBanks() {
        val active=connection ?: return; val namespace=scope; val client=WorkspaceClient(active)
        val status=client.banks(); if(scope!=namespace) return; bankStatus=status
        if(status.ready) for(item in status.items.filter { it.connected==1 }) {
            try { client.action("banks",mapOf("action" to "sync","itemId" to item.id)) } catch(error: Exception) { failure=error.message }
            if(scope!=namespace) return
        }
        do { val page=client.bankFeed(journal.bankCursor); if(scope!=namespace) return
            update { it.copy(bankTransactions=mergeBank(it.bankTransactions,page.transactions),bankCursor=page.cursor,bankUpdatedAt=now()) }
        } while(page.hasMore)
    }
    suspend fun referralAction(values: Map<String,String>?=null) {
        val active=connection ?: return; val namespace=scope; val client=WorkspaceClient(active)
        val result=if(values==null) client.referrals() else client.action("referrals",values)
        if(scope==namespace) rewards=result
    }
    fun addReceipt(bytes: ByteArray,mime: String): LocalReceipt {
        val receipt=LocalReceipt(mime=mime); store.saveReceipt(scope,receipt.id,bytes); update { it.copy(receipts=it.receipts+receipt) }; return receipt
    }
    suspend fun receipt(id: String): ByteArray {
        val namespace=scope
        return try { store.receipt(namespace,id) } catch(_: Exception) {
            val active=connection ?: error("Receipt is unavailable on this phone.")
            val bytes=WorkspaceClient(active).send("receipts/$id"); check(namespace==scope); store.saveReceipt(namespace,id,bytes); bytes
        }
    }
    fun startDrive(automatic: Boolean=false,startedAt: String=now()) {
        check(journal.activeTripId==null); val record=DriverRecord.trip(Trip.local(startedAt).copy(automaticallyDetected=automatic))
        update { it.upsert(record).copy(activeTripId=record.id,tracker=TripAccumulator()) }
    }
    fun observe(fix: LocationFix,clock: java.time.Instant=java.time.Instant.now()) {
        val active=journal.active ?: return; val tracker=journal.tracker?.copy() ?: TripAccumulator(hasGaps=true)
        val anchor=tracker.anchor
        if(tracker.consume(fix,clock)) store.appendRoute(scope,active.record.id,fix.copy(startsSegment=anchor==null || tracker.hasGaps && !journal.active!!.record.trip().hasGaps))
        val trip=active.record.trip().copy(distanceMeters=tracker.distanceMeters,hasGaps=tracker.hasGaps,sampleCount=tracker.sampleCount)
        update { it.upsert(DriverRecord.trip(trip,active.record.id,active.record.revision)).copy(tracker=tracker) }
    }
    fun endDrive() { val active=journal.active ?: return
        update { it.upsert(DriverRecord.trip(active.record.trip().copy(endedAt=now()),active.record.id,active.record.revision)).copy(activeTripId=null,tracker=null) }
    }
    fun pauseDrive() { if(storageReady && journal.activeTripId!=null) update { it.markTrackingInterrupted() } }
    fun resolve(id: String,keepLocal: Boolean) { update { state -> state.copy(entries=state.entries.map { entry ->
        if(entry.record.id!=id || entry.conflict==null) entry else if(keepLocal) LocalEntry(entry.record.copy(revision=entry.conflict.record.revision)) else LocalEntry(entry.conflict.record,pendingMutationId=null)
    }) } }
}
