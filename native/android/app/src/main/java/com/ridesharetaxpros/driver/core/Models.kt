package com.ridesharetaxpros.driver.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

val Wire = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
fun uuid(): String = UUID.randomUUID().toString()
fun now(): String = Instant.now().toString()
fun today(): String = LocalDate.now().toString()
fun day(instant: String, zone: String = "UTC"): String = Instant.parse(instant).atZone(ZoneId.of(zone)).toLocalDate().toString()

@Serializable data class BankReference(val transactionId: String, val provider: String, val accountLabel: String)
@Serializable data class Trip(
    val startedAt: String = now(), val endedAt: String? = null, val distanceMeters: Double = 0.0,
    val classification: String = "unclassified", val purpose: String = "", val notes: String = "", val source: String = "gps",
    val hasGaps: Boolean = false, val sampleCount: Int = 0, val localDate: String? = day(startedAt, ZoneId.systemDefault().id),
    val timeZoneId: String? = ZoneId.systemDefault().id, val earningsCents: Int? = null, val platformFeesCents: Int? = null,
    val rideRole: String? = null, val automaticallyDetected: Boolean? = null, val platform: String? = null, val workArea: String? = null
) { val recordedDate get() = localDate ?: day(startedAt, timeZoneId ?: "UTC") }
@Serializable data class Expense(
    val date: String = today(), val merchant: String, val category: String = "other", val amountCents: Int,
    val currency: String = "USD", val classification: String = "unclassified", val notes: String = "", val receiptId: String? = null,
    val businessPurpose: String? = null, val businessUsePercent: Int? = null, val mealContext: String? = null,
    val vehicle: String? = null, val odometerMiles: Double? = null, val paymentMethod: String? = null, val place: String? = null,
    val bankReference: BankReference? = null
)
@Serializable data class Income(val date: String = today(), val platform: String = "other", val description: String,
    val amountCents: Int, val currency: String = "USD", val notes: String = "", val bankReference: BankReference? = null)
@Serializable data class DriverRecord(val id: String = uuid(), val revision: Int = 0, val deleted: Boolean = false,
    val kind: String, val body: JsonObject) {
    fun trip(): Trip = Wire.decodeFromJsonElement(body)
    fun expense(): Expense = Wire.decodeFromJsonElement(body)
    fun income(): Income = Wire.decodeFromJsonElement(body)
    val date: String get() = when(kind) { "trip" -> trip().recordedDate; "expense" -> expense().date; else -> income().date }
    val title: String get() = when(kind) { "trip" -> trip().purpose.ifBlank { "Driving trip" }; "expense" -> expense().merchant; else -> income().description }
    val bankReference: BankReference? get() = when(kind) { "expense" -> expense().bankReference; "income" -> income().bankReference; else -> null }
    companion object {
        fun trip(value: Trip, id: String = uuid(), revision: Int = 0) = DriverRecord(id, revision, kind="trip", body=Wire.encodeToJsonElement(value) as JsonObject)
        fun expense(value: Expense, id: String = uuid(), revision: Int = 0) = DriverRecord(id, revision, kind="expense", body=Wire.encodeToJsonElement(value) as JsonObject)
        fun income(value: Income, id: String = uuid(), revision: Int = 0) = DriverRecord(id, revision, kind="income", body=Wire.encodeToJsonElement(value) as JsonObject)
    }
}
@Serializable data class ServerRecord(val record: DriverRecord, val updatedAt: String, val sequence: Long)
@Serializable data class LocalEntry(val record: DriverRecord, val pendingMutationId: String? = uuid(), val conflict: ServerRecord? = null)
@Serializable data class LocalReceipt(val id: String = uuid(), val mime: String, val uploaded: Boolean = false)
@Serializable data class Mutation(val mutationId: String, val record: DriverRecord)
@Serializable data class SyncPage(val records: List<ServerRecord>, val cursor: Long, val hasMore: Boolean)
@Serializable data class Goals(val dailyNetCents: Int? = null, val weeklyNetCents: Int? = null, val targetHourlyCents: Int? = null, val vehicleCostCentsPerMile: Double? = null)
@Serializable data class Assistance(val automaticDrives: Boolean = false, val placeReminders: Boolean = false)
@Serializable data class ExpensePrompt(val id: String = uuid(), val placeId: String, val merchant: String, val address: String,
    val category: String, val detectedAt: String = now(), val dismissed: Boolean = false)
@Serializable data class BankTransaction(val id: String, val provider: String, val accountLabel: String, val date: String,
    val merchant: String, val amountCents: Int, val currency: String = "USD", val pending: Boolean = false,
    val removed: Boolean = false, val suggestedCategory: String? = null, val reviewedRecordId: String? = null,
    val ignored: Boolean? = null, val needsUpdateReview: Boolean? = null, val isTestData: Boolean? = null) {
    val ready get() = !pending && !removed && ignored != true && reviewedRecordId == null && amountCents != 0
    val reference get() = BankReference(id, provider, accountLabel)
}
@Serializable data class Journal(val version: Int = 1, val cursor: Long = 0, val entries: List<LocalEntry> = emptyList(),
    val receipts: List<LocalReceipt> = emptyList(), val activeTripId: String? = null, val tracker: TripAccumulator? = null,
    val lastSyncAt: String? = null, val goals: Goals = Goals(), val assistance: Assistance = Assistance(),
    val bankTransactions: List<BankTransaction> = emptyList(), val placePrompts: List<ExpensePrompt> = emptyList(),
    val bankCursor: Long = 0, val bankUpdatedAt: String? = null,
    val mission: ShiftMission? = null, val waitSamples: List<WaitSample> = emptyList(),
    val vehicleReservePercent: Double? = null, val taxReservePercent: Double? = null) {
    val visible get() = entries.filter { !it.record.deleted }.sortedByDescending { it.record.date }
    val active get() = entries.firstOrNull { it.record.id == activeTripId }
    fun upsert(record: DriverRecord): Journal {
        require(record.bankReference == null || visible.none { it.record.id != record.id && it.record.bankReference?.transactionId == record.bankReference?.transactionId }) { "This bank transaction is already linked to a journal record." }
        val prior = entries.firstOrNull { it.record.id == record.id }
        val entry = LocalEntry(record.copy(revision=prior?.record?.revision ?: record.revision), conflict=prior?.conflict)
        return copy(entries=entries.filterNot { it.record.id == record.id } + entry,
            bankTransactions=bankTransactions.map { if (it.id == record.bankReference?.transactionId) it.copy(reviewedRecordId=record.id) else it })
    }
    fun merge(remote: ServerRecord): Journal {
        val existing = entries.firstOrNull { it.record.id == remote.record.id }
        if (existing != null && existing.record.revision >= remote.record.revision) return this
        val entry = if (existing?.pendingMutationId != null) existing.copy(conflict=remote) else LocalEntry(remote.record, pendingMutationId=null)
        return copy(entries=entries.filterNot { it.record.id == remote.record.id } + entry)
    }
    fun acknowledge(mutation: Mutation, remote: ServerRecord): Journal = copy(entries=entries.map {
        if (it.record.id != remote.record.id) it else if (it.pendingMutationId == mutation.mutationId) LocalEntry(remote.record, pendingMutationId=null)
        else it.copy(record=it.record.copy(revision=maxOf(it.record.revision, remote.record.revision)))
    })
}
val expenseCategories = linkedMapOf("fuel" to "Fuel", "ev_charging" to "EV charging", "repairs" to "Vehicle repairs",
    "maintenance" to "Maintenance & oil", "tires" to "Tires", "cleaning" to "Car wash & cleaning", "insurance" to "Vehicle insurance",
    "registration" to "Registration & inspections", "rental" to "Vehicle rental", "lease" to "Vehicle lease", "interest" to "Vehicle interest",
    "tolls" to "Tolls", "parking" to "Parking", "meals" to "Meals & food", "lodging" to "Lodging", "amenities" to "Rider snacks & amenities",
    "supplies" to "Supplies & equipment", "phone" to "Phone & data", "fees" to "Platform & payment fees", "subscriptions" to "Apps & subscriptions",
    "training" to "Training & licenses", "professional" to "Tax & professional fees", "other" to "Other")
