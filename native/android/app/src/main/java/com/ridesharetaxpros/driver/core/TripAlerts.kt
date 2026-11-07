package com.ridesharetaxpros.driver.core

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.Serializable

@Serializable data class TripAlertToken(val id: String = uuid(), val kind: String, val scope: String,
    val tripId: String? = null,val promptId: String? = null,val createdAt: String = now(),
    val expiresAt: String,val handledAt: String? = null)
data class TripAlertOutcome(val journal: Journal,val result: String,val recordId: String? = null)

fun Journal.prepareTripAlert(kind: String,scope: String,tripId: String? = null,promptId: String? = null,
    clock: Instant = Instant.now()): Pair<Journal,TripAlertToken> {
    val prior=tripAlerts.firstOrNull {it.kind==kind && it.scope==scope && it.tripId==tripId && it.promptId==promptId && it.handledAt==null && clock<Instant.parse(it.expiresAt)}
    if(prior!=null) return this to prior
    val token=TripAlertToken(kind=kind,scope=scope,tripId=tripId,promptId=promptId,createdAt=clock.toString(),
        expiresAt=clock.plusSeconds(if(kind=="start" || kind=="end") 300 else 86400).toString())
    return copy(tripAlerts=(tripAlerts.takeLast(99)+token)) to token
}
fun Journal.applyTripAlert(id: String,action: String,scope: String,value: String? = null,clock: Instant = Instant.now()): TripAlertOutcome {
    val alert=tripAlerts.firstOrNull {it.id==id} ?: error("This alert is no longer available.")
    require(alert.scope==scope) {"This alert belongs to a different account."}
    if(alert.handledAt!=null) return TripAlertOutcome(this,"already")
    require(clock>=Instant.parse(alert.createdAt).minusSeconds(5) && clock<=Instant.parse(alert.expiresAt)) {"That alert expired. Your current trip was not changed."}
    var next=this;var recordId: String?=null
    when(action) {
        "start" -> {
            require(alert.kind=="start" && activeTripId==null) {"Your drive changed after this alert."}
            val record=DriverRecord.trip(Trip.local(clock.toString()).copy(purpose="Drive started from alert",hasGaps=true))
            next=upsert(record).copy(activeTripId=record.id,tracker=TripAccumulator(hasGaps=true));recordId=record.id
        }
        "end" -> {
            require(alert.kind=="end" && activeTripId==alert.tripId) {"Your drive changed after this alert."}
            val entry=active ?: error("No matching active drive.");require(entry.conflict==null)
            next=upsert(DriverRecord.trip(entry.record.trip().copy(endedAt=maxOf(clock,Instant.parse(entry.record.trip().startedAt)).toString()),entry.record.id,entry.record.revision)).copy(activeTripId=null,tracker=null)
            recordId=entry.record.id
        }
        "business","personal","fare" -> {
            require(alert.kind==if(action=="fare") "fare" else "classify")
            val entry=visible.firstOrNull {it.record.id==alert.tripId && it.record.kind=="trip"} ?: error("The completed drive is unavailable.")
            require(entry.record.trip().endedAt!=null && entry.conflict==null) {"Review the drive or its sync conflict in the app."}
            val trip=if(action=="fare") {
                val fields=(value ?: "").lowercase().trim().split(Regex("\\s+"))
                require(fields.size==2 && fields[0].startsWith("fare=") && fields[1].startsWith("fees=")) {"Enter fare=20 fees=3 using known amounts."}
                val fare=StatementImport.cents(fields[0].drop(5));val fees=StatementImport.cents(fields[1].drop(5));require(fare>=0 && fees>=0)
                entry.record.trip().copy(earningsCents=fare,platformFeesCents=fees)
            } else entry.record.trip().copy(classification=action)
            next=upsert(DriverRecord.trip(trip,entry.record.id,entry.record.revision));recordId=entry.record.id
        }
        "expense" -> {
            require(alert.kind=="expense")
            val prompt=placePrompts.firstOrNull {it.id==alert.promptId && !it.dismissed} ?: error("That purchase prompt is unavailable.")
            val cents=StatementImport.cents(value ?: "");require(cents>0)
            val date=day(prompt.detectedAt,ZoneId.systemDefault().id)
            require(visible.none {it.record.kind=="expense" && it.record.expense().let {row->row.date==date && row.amountCents==cents && row.merchant.equals(prompt.merchant,true)}}) {"A similar expense exists. Review it in Money before adding another."}
            val record=DriverRecord.expense(Expense(date=date,merchant=prompt.merchant,category=prompt.category,amountCents=cents,place=prompt.address))
            next=upsert(record).copy(placePrompts=placePrompts.map {if(it.id==prompt.id) it.copy(dismissed=true) else it});recordId=record.id
        }
        "keep" -> require(alert.kind=="end" && activeTripId==alert.tripId) {"Your drive changed after this alert."}
        "dismiss" -> if(alert.kind=="expense") next=copy(placePrompts=placePrompts.map {if(it.id==alert.promptId) it.copy(dismissed=true) else it})
        else -> error("This action does not match the alert.")
    }
    next=next.copy(tripAlerts=next.tripAlerts.map {if(it.id==id) it.copy(handledAt=clock.toString()) else it})
    return TripAlertOutcome(next,action,recordId)
}
