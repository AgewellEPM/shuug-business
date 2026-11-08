package com.ridesharetaxpros.driver.ui

import java.net.URI
import java.net.URLDecoder
import org.junit.Assert.*
import org.junit.Test

class GoogleMapsHandoffTest {
    @Test fun directionsEncodeEverySelectedEndpointWithoutInjectingQueryFields() {
        val url=googleMapsDirectionsUrl("Main & Park, Hartford",origin="41.7,-72.7",waypoints=listOf("Pickup #1","Drop-off / 2"))
        val uri=URI(url);assertEquals("https",uri.scheme);assertEquals("www.google.com",uri.host);assertEquals("/maps/dir/",uri.path)
        val parameters=uri.rawQuery.split('&').associate {it.substringBefore('=') to URLDecoder.decode(it.substringAfter('='),Charsets.UTF_8.name())}
        assertEquals("1",parameters["api"]);assertEquals("driving",parameters["travelmode"])
        assertEquals("Main & Park, Hartford",parameters["destination"]);assertEquals("41.7,-72.7",parameters["origin"])
        assertEquals("Pickup #1|Drop-off / 2",parameters["waypoints"]);assertEquals(5,parameters.size)
    }
    @Test fun directionsRejectUnboundedOrControlCharacterEndpoints() {
        assertTrue(runCatching {googleMapsDirectionsUrl(" ")}.isFailure)
        assertTrue(runCatching {googleMapsDirectionsUrl("Main\nStreet")}.isFailure)
        assertTrue(runCatching {googleMapsDirectionsUrl("A".repeat(501))}.isFailure)
        assertTrue(runCatching {googleMapsDirectionsUrl("Main",waypoints=List(9) {"Stop"})}.isFailure)
        assertTrue(runCatching {googleMapsDirectionsUrl("Main",waypoints=List(8) {"\u00e9".repeat(200)})}.isFailure)
        assertTrue(googleMapsDirectionsUrl("Main",waypoints=List(3) {"A".repeat(200)}).contains("waypoints="))
    }
}
