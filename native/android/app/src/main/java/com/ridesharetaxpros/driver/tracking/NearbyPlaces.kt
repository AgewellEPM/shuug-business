package com.ridesharetaxpros.driver.tracking

import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.boundedRead
import java.net.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

/** Optional stationary lookup only; OpenStreetMap data is incomplete and not a purchase signal. */
object NearbyPlaces {
    suspend fun find(fix: LocationFix): ExpensePrompt?=withContext(Dispatchers.IO) {
        val around="around:90,${fix.latitude},${fix.longitude}"
        val query="[out:json][timeout:12];(nwr($around)[amenity~\"^(fuel|charging_station|restaurant|fast_food|cafe)$\"];nwr($around)[shop~\"^(car|car_repair|car_parts|tyres)$\"];);out center 25;"
        val request=URI("https://overpass-api.de/api/interpreter").toURL().openConnection() as HttpURLConnection
        try {
            request.instanceFollowRedirects=false; request.requestMethod="POST"; request.connectTimeout=15000; request.readTimeout=18000
            request.setRequestProperty("User-Agent","RideshareTaxPros-Android/0.1 (+https://rideshare-tax-pros.pages.dev)")
            request.setRequestProperty("Content-Type","application/x-www-form-urlencoded"); request.doOutput=true
            request.outputStream.use { it.write(("data="+URLEncoder.encode(query,"UTF-8")).toByteArray()) }
            require(request.responseCode==200)
            val body=request.inputStream.use { boundedRead(it,500000) }
            val entries=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject["elements"]!!.jsonArray
            entries.mapNotNull { element ->
                val row=element.jsonObject; val tags=row["tags"]?.jsonObject ?: return@mapNotNull null
                val center=row["center"]?.jsonObject ?: row
                val lat=center["lat"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                val lon=center["lon"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                val distance=fix.distance(LocationFix(lat,lon,0.0,fix.timestamp)); if(distance>90) return@mapNotNull null
                val type=tags["amenity"]?.jsonPrimitive?.content ?: tags["shop"]?.jsonPrimitive?.content
                val category=when(type) { "fuel"->"fuel"; "charging_station"->"ev_charging"; "restaurant","fast_food","cafe"->"meals"; "tyres"->"tires"; else->"repairs" }
                val name=tags["name"]?.jsonPrimitive?.content ?: tags["brand"]?.jsonPrimitive?.content ?: expenseCategories[category]!!
                distance to ExpensePrompt(placeId="osm:"+row["type"]!!.jsonPrimitive.content+":"+row["id"]!!.jsonPrimitive.content,
                    merchant=name.take(160),address=listOfNotNull(tags["addr:housenumber"]?.jsonPrimitive?.content,tags["addr:street"]?.jsonPrimitive?.content).joinToString(" ").take(200),category=category)
            }.minByOrNull { it.first }?.second
        } finally { request.disconnect() }
    }
}
