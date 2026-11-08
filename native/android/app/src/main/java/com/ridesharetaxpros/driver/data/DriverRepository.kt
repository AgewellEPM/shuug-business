package com.ridesharetaxpros.driver.data

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.tracking.DriveService
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

private val classificationsForDrive=setOf("unclassified","business","personal")

class DriverApplication: Application() {
    val repository by lazy { DriverRepository(this) }
    override fun onCreate() {
        super.onCreate()
        ProtectedTransportPolicy.configurationSource={try {assets.open("SecureTaxTrustedPins.json").use {boundedRead(it,16384)}}catch(_:java.io.FileNotFoundException) {null}}
    }
}
class DriverRepository(val app: Application) {
    val store=PrivateStore(app)
    private val jobs=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    var connection by mutableStateOf<Connection?>(null); private set
    var journal by mutableStateOf(Journal()); private set
    var failure by mutableStateOf<String?>(null)
    var storageReady by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var updatingProfile by mutableStateOf(false); private set
    var changingAccount by mutableStateOf(false); private set
    var profileError by mutableStateOf<String?>(null); private set
    var bankStatus by mutableStateOf<BankStatus?>(null); private set
    var rewards by mutableStateOf<JsonObject?>(null); private set
    var trackingStatus by mutableStateOf("Tracking is off")
    var offerReaderStatus by mutableStateOf("Offer reading is off")
    var requestedOfferReader by mutableStateOf(false)
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
        check(connection==null) {"Sign out before connecting a different client account."}
        check(!busy && !updatingProfile && !changingAccount) {"Wait for the current account operation to finish."}
        check(journal.activeTripId==null) { "End your current drive before switching accounts." }; check(storageReady)
        changingAccount=true
        try {
        val origin=WorkspaceClient.origin(address); val reply=WorkspaceClient(address=origin).login(email.trim(),password)
        val next=Connection(origin,reply); val namespace=PrivateStore.hash(origin+"|"+reply.account.id)
        val saved=store.journal(namespace).let {it.copy(offerReader=it.offerReader.copy(enabled=false))}
        store.save(namespace,saved)
        store.write("session","connection.json",Wire.encodeToString(next).toByteArray())
        app.stopService(Intent(app,DriveService::class.java)); app.stopService(Intent(app,com.ridesharetaxpros.driver.offers.OfferScreenService::class.java))
        connection=next; journal=saved; rewards=null; bankStatus=null;profileError=null
        } finally {changingAccount=false}
        sync()
    }
    suspend fun reauthenticate(password:String) {
        val expected=connection ?: error("Connect your client account first.")
        check(!busy && !updatingProfile && !changingAccount && journal.activeTripId==null) {"Finish the current drive or account operation before signing in again."}
        changingAccount=true
        try {
            val reply=WorkspaceClient(address=expected.origin).login(expected.session.account.email,password)
            check(connection==expected) {"Your account changed. Open sign-in again."}
            val next=sameAccountReauthentication(expected,reply)
            store.write("session","connection.json",Wire.encodeToString(next).toByteArray());connection=next;profileError=null
        } finally {changingAccount=false}
        sync()
    }
    suspend fun disconnect() {
        check(!busy && !updatingProfile && !changingAccount) {"Wait for the current account operation to finish before signing out."}
        check(journal.activeTripId==null) { "End your current drive before disconnecting." }
        val previous=connection
        changingAccount=true
        try {
        val guest=store.journal("guest").let {it.copy(offerReader=it.offerReader.copy(enabled=false))}
        store.save("guest",guest)
        // An empty encrypted optional value is understood as signed out at next launch.
        store.clearConnection(); app.stopService(Intent(app,DriveService::class.java))
        app.stopService(Intent(app,com.ridesharetaxpros.driver.offers.OfferScreenService::class.java))
        connection=null; journal=guest; rewards=null; bankStatus=null;profileError=null
        } finally {changingAccount=false}
        previous?.let {try {WorkspaceClient(it).send("session","DELETE")} catch(error:CancellationException) {throw error} catch(_:Exception) { /* Local sign-out remains usable offline. */ }}
    }
    fun transferGuest(includeCoach:Boolean=false,includeReputation:Boolean=false,includeRecords:Boolean=true) {
        check(connection!=null && journal.activeTripId==null); val guest=store.journal("guest"); check(guest.activeTripId==null)
        if(includeRecords) {
            guest.receipts.forEach { store.saveReceipt(scope,it.id,store.receipt("guest",it.id)) }
            guest.entries.filter { it.record.kind=="trip" && journal.entries.none { old->old.record.id==it.record.id } }.forEach { store.copyRoute("guest",scope,it.record.id) }
        }
        update { current -> var next=current
            if(includeRecords) {
                guest.visible.forEach { entry -> if(next.entries.none { it.record.id==entry.record.id }) next=next.upsert(entry.record.copy(revision=0)) }
                next=next.copy(receipts=(next.receipts+guest.receipts.map { it.copy(uploaded=false) }).distinctBy { it.id },
                bankTransactions=mergeBank(next.bankTransactions,guest.bankTransactions),goals=guest.goals,assistance=guest.assistance,
                placePrompts=(next.placePrompts+guest.placePrompts).distinctBy { it.id }.takeLast(100),
                mission=next.mission ?: guest.mission,waitSamples=(next.waitSamples+guest.waitSamples).distinct().takeLast(1000),
                vehicleReservePercent=next.vehicleReservePercent ?: guest.vehicleReservePercent,taxReservePercent=next.taxReservePercent ?: guest.taxReservePercent)
            }
            if(includeReputation) next=next.copyGuestReputation(guest)
            if(includeCoach) next=next.copyGuestCoach(guest)
            next
        }
        // Keep the guest source as a recoverable copy; stable record IDs make repeats safe.
    }
    suspend fun sync() {
        val active=connection ?: return; if(busy || updatingProfile || changingAccount) return; val namespace=scope; busy=true
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
            refreshProfile()
        } finally { busy=false }
    }
    private fun applyProfile(reply:AccountProfileReply,expected:Connection,namespace:String) {
        check(scope==namespace && connection?.origin==expected.origin && connection?.session?.token==expected.session.token) {"Your account changed before the profile update finished."}
        val next=reply.applyTo(expected)
        store.write("session","connection.json",Wire.encodeToString(next).toByteArray());connection=next;profileError=null
    }
    suspend fun refreshProfile() {
        val expected=connection ?: return;if(updatingProfile || changingAccount) return;val namespace=scope
        try {applyProfile(WorkspaceClient(expected).profile(),expected,namespace)}
        catch(error:CancellationException) {throw error}
        catch(error:Exception) {if(scope==namespace && connection?.session?.token==expected.session.token)profileError=error.message}
    }
    suspend fun updateProfileName(raw:String) {
        val expected=connection ?: error("Connect your client account first.")
        check(!busy && !updatingProfile && !changingAccount) {"Wait for the current sync or profile update to finish."}
        val name=validatedDisplayName(raw);val namespace=scope;updatingProfile=true
        try {applyProfile(WorkspaceClient(expected).profile(name),expected,namespace)} finally {updatingProfile=false}
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
    fun startDrive(automatic: Boolean=false,startedAt: String=now(),classification: String="unclassified",purpose: String="") {
        check(journal.activeTripId==null); val record=DriverRecord.trip(Trip.local(startedAt).copy(automaticallyDetected=automatic,classification=classification.takeIf {it in classificationsForDrive} ?: "unclassified",purpose=purpose.take(240)))
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
