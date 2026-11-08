package com.ridesharetaxpros.driver.core

import java.time.LocalDate
import java.time.ZoneId

val sampleShiftGoals=Goals(dailyNetCents=15000,weeklyNetCents=75000,targetHourlyCents=2000,vehicleCostCentsPerMile=50.0)

/** Exact iOS GigSampleShift 30-day fixture; returned records never enter a journal. */
fun sampleShiftRecords(through: LocalDate=LocalDate.now(),zone: ZoneId=ZoneId.systemDefault()): List<DriverRecord> {
    val records=mutableListOf<DriverRecord>();val platforms=gigPlatforms.keys.toList()
    for(offset in 29 downTo 0) {
        val day=through.minusDays(offset.toLong());val start=day.atTime(9,0).atZone(zone).toInstant();val count=4+offset%4
        for(index in 0 until count) {
            val unpaid=index==count-1;val miles=if(unpaid) (3+offset%4).toDouble() else (4+(index*3+offset)%9).toDouble()
            val begin=start.plusSeconds(index*2900L)
            val trip=Trip.local(begin.toString(),zone).copy(endedAt=begin.plusSeconds((if(unpaid) 13 else 25+index*4)*60L).toString(),
                distanceMeters=miles*1609.344,classification="business",purpose=if(unpaid) "Sample repositioning" else "Sample delivery",source="sample",
                rideRole=if(unpaid) "reposition" else "delivery",earningsCents=if(unpaid) 0 else 2200+((index*7+offset*3)%16)*100,
                platformFeesCents=if(unpaid) 0 else 150,platform=platforms[(offset+index)%platforms.size],workArea=listOf("West Hartford","Newington","Wethersfield")[index%3])
            records+=DriverRecord.trip(trip,"00000001-0000-0000-0000-%012d".format(java.util.Locale.US,offset*10+index+1))
        }
        records+=DriverRecord.income(Income(date=day.toString(),platform=platforms[offset%platforms.size],description="Sample platform payout",amountCents=11800+(offset%6)*1200),
            "00000002-0000-0000-0000-%012d".format(java.util.Locale.US,offset+1))
        if(offset%3==0) records+=DriverRecord.expense(Expense(date=day.toString(),merchant="Sample fuel stop",category="fuel",amountCents=3200+(offset%5)*175,classification="business"),
            "00000003-0000-0000-0000-%012d".format(java.util.Locale.US,offset+1))
    }
    return records
}
