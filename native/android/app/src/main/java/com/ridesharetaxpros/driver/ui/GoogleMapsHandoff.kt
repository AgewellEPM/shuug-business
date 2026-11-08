package com.ridesharetaxpros.driver.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.ridesharetaxpros.driver.core.PositionPoint
import java.net.URLEncoder

const val GOOGLE_MAPS_PACKAGE="com.google.android.apps.maps"
fun googleMapsDirectionsUrl(destination: String,origin: String?=null,waypoints: List<String> = emptyList()): String {
    fun checked(value: String)=value.trim().also {require(it.length in 1..500 && it.none {ch->ch.isISOControl()}) {"Choose a valid destination."}}
    fun encode(value: String)=URLEncoder.encode(value,Charsets.UTF_8.name())
    require(waypoints.size<=8) {"Choose no more than eight intermediate stops."}
    return ("https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="+encode(checked(destination))+
        (origin?.let {"&origin="+encode(checked(it))} ?: "")+(if(waypoints.isEmpty()) "" else "&waypoints="+encode(waypoints.joinToString("|") {checked(it)})))
        .also {require(it.length<=2048) {"Choose fewer or shorter intermediate stops."}}
}
fun googleMapsDirectionsIntent(destination: String,origin: String?=null,waypoints: List<String> = emptyList()): Intent =
    Intent(Intent.ACTION_VIEW,Uri.parse(googleMapsDirectionsUrl(destination,origin,waypoints))).setPackage(GOOGLE_MAPS_PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
/** The handoff stays inside the native Google Maps package; there is no browser fallback. */
fun openGoogleMapsDirections(context: Context,destination: PositionPoint,origin: PositionPoint?=null,waypoints: List<PositionPoint> = emptyList()): String? = try {
    require(destination.valid && (origin?.valid ?: true) && waypoints.all {it.valid}) {"Choose valid route endpoints."}
    fun text(point: PositionPoint)="${point.latitude},${point.longitude}"
    val intent=googleMapsDirectionsIntent(text(destination),origin?.let(::text),waypoints.map(::text))
    if(intent.resolveActivity(context.packageManager)==null) "Google Maps is not installed or available for this route. Install or update Google Maps, then try again."
    else {context.startActivity(intent);null}
} catch(_: Exception) {"Google Maps could not open this route. Install or update Google Maps, then try again."}

fun openGoogleMapsStreetView(context: Context,point: PositionPoint): String? = try {
    require(point.valid) {"Choose valid coordinates."}
    val intent=Intent(Intent.ACTION_VIEW,Uri.parse("google.streetview:cbll=${point.latitude},${point.longitude}"))
        .setPackage(GOOGLE_MAPS_PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if(intent.resolveActivity(context.packageManager)==null) "Google Maps is not installed or available for Street View. Install or update Google Maps, then try again."
    else {context.startActivity(intent);null}
} catch(_: Exception) {"Google Maps could not open Street View. Install or update Google Maps, then try again."}
