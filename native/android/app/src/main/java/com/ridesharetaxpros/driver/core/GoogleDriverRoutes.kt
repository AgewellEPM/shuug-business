package com.ridesharetaxpros.driver.core

import com.ridesharetaxpros.driver.data.Connection
import com.ridesharetaxpros.driver.data.PrivateStore
import com.ridesharetaxpros.driver.data.WorkspaceClient
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.*

/** User-requested operational routing, separate from saved tax records and staff Visits. */
object GoogleDriverRoutes {
    suspend fun request(scope: String,from: PositionPoint,to: PositionPoint,alternatives: Boolean,connection: Connection?): List<PositionRoad> {
        require(from.valid && to.valid) {"Choose valid route endpoints."}
        val account=connection ?: error("Connect your invited client account for in-app Google comparisons. Directions in Google Maps works without connecting.")
        require(PrivateStore.hash(account.origin+"|"+account.session.account.id)==scope) {"Your account changed. Reopen the route comparison."}
        require(runCatching {Instant.parse(account.session.expiresAt)>Instant.now()}.getOrDefault(false)) {"Your sign-in expired. Reconnect before requesting Google comparisons."}
        val client=WorkspaceClient(account)
        currentCoroutineContext().ensureActive()
        val status=parseGoogleRouteReadiness(client.customer("driver/routes",maximum=16384).toString(Charsets.UTF_8))
        require(status.ready) {status.reason}
        currentCoroutineContext().ensureActive()
        val body=buildJsonObject {
            put("origin",buildJsonObject {put("latitude",from.latitude);put("longitude",from.longitude)})
            put("destination",buildJsonObject {put("latitude",to.latitude);put("longitude",to.longitude)})
            put("alternatives",alternatives)
        }.toString().toByteArray(Charsets.UTF_8)
        val response=client.customer("driver/routes","POST",body,maximum=4*1024*1024)
        currentCoroutineContext().ensureActive()
        require(response.size<=4*1024*1024) {"The Google route response is too large."}
        return parseGooglePositionRoads(response.toString(Charsets.UTF_8))
    }
}
internal data class GoogleRouteReadiness(val ready: Boolean,val reason: String)
internal fun parseGoogleRouteReadiness(json: String): GoogleRouteReadiness {
    val body=Wire.parseToJsonElement(json).jsonObject
    val provider=body["provider"] as? JsonPrimitive
    val ready=body["ready"] as? JsonPrimitive
    require(provider?.isString==true && provider.content=="googleRoutes" && ready!=null && !ready.isString && ready.booleanOrNull!=null) {
        "Your firm's Google routing status could not be verified. Directions in Google Maps is still available."
    }
    val reason=(body["reason"] as? JsonPrimitive)?.takeIf {it.isString}?.contentOrNull?.take(300)?.takeIf {it.isNotBlank()}
        ?: "In-app Google comparisons are not connected yet. Directions in Google Maps is available."
    return GoogleRouteReadiness(ready.boolean,reason)
}
internal fun parseGooglePositionRoads(json: String,clock: Instant=Instant.now()): List<PositionRoad> {
    val body=Wire.parseToJsonElement(json).jsonObject
    require(body["provider"]?.jsonPrimitive?.contentOrNull=="googleRoutes") {"The routing provider could not be verified."}
    val measured=body["measuredAt"]?.jsonPrimitive?.contentOrNull?.let {runCatching {Instant.parse(it)}.getOrNull()}
        ?: error("The Google route timestamp is missing.")
    require(Duration.between(measured,clock).seconds in -5..300) {"The Google road estimates are old. Compare again."}
    val routes=body["routes"]?.jsonArray ?: error("No Google road routes were returned.")
    require(routes.size in 1..3) {"No supported Google driving route was returned."}
    require(routes.sumOf {it.jsonObject["points"]?.jsonArray?.size ?: 0}<=50000) {"These Google routes are too large to display."}
    return routes.mapIndexed {index,item->
        val value=item.jsonObject
        fun number(objectValue: JsonObject,key: String): Double = (objectValue[key] as? JsonPrimitive)?.takeIf {!it.isString}?.doubleOrNull
            ?: error("Google road estimates are incomplete.")
        val meters=number(value,"distanceMeters");val seconds=number(value,"durationSeconds")
        require(meters.isFinite() && meters in 0.0..20_000_000.0 && seconds.isFinite() && seconds in 0.0..864000.0 && (meters==0.0 || seconds>0.0)) {"Google road estimates are incomplete."}
        val geometry=value["points"]?.jsonArray ?: error("Google road geometry is missing.")
        require(geometry.size in 2..50000) {"This Google route is too large to display."}
        val points=geometry.map {element->val point=element.jsonObject
            PositionPoint(number(point,"latitude"),number(point,"longitude")).also {require(it.valid)}}
        val name=value["name"]?.jsonPrimitive?.contentOrNull?.take(180)?.takeIf {it.isNotBlank()} ?: "Route option ${index+1}"
        PositionRoad(meters,seconds,points,minOf(measured,clock),"Google Maps · Current road estimate",name,RoadProvider.GOOGLE)
    }
}
