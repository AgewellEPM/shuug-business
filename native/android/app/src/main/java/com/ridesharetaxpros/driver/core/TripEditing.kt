package com.ridesharetaxpros.driver.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/** Minute pickers must not rewrite untouched seconds or fall-back offsets. */
fun tripEditedInstant(original:String?,date:String,time:String,zone:ZoneId):Instant {
    val local=LocalDate.parse(date).atTime(LocalTime.parse(time))
    val previous=original?.let {Instant.parse(it).atZone(zone)}
    if(previous!=null && previous.toLocalDate().toString()==date && previous.format(DateTimeFormatter.ofPattern("HH:mm"))==time)return previous.toInstant()
    val offsets=zone.rules.getValidOffsets(local)
    require(offsets.isNotEmpty()) {"That local time does not exist because the clocks change. Choose another time."}
    val preferred=previous?.offset?.takeIf {it in offsets}
    return ZonedDateTime.ofLocal(local,zone,preferred).toInstant()
}
