package com.ridesharetaxpros.driver.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.*
import kotlinx.coroutines.delay

/** All endpoints are explicitly selected; search terms and road results stay in this screen. */
@Composable fun OfferRouteScreen(repo: DriverRepository,offerId: String) {
    val scope=repo.scope;val context=LocalContext.current
    val offer=reviewedOffers(repo.journal).firstOrNull {it.id==offerId}
    if(offer==null) {Text("This offer is no longer saved on this phone.");return}
    val sourceKey=Triple(offerId,offer.pickup,offer.dropoff)
    var journey by remember(scope,sourceKey) {mutableStateOf<OfferRoadJourney?>(null)}
    var deadline by remember(scope,offerId) {mutableStateOf(runCatching {Instant.parse(repo.journal.mission?.deadline).atZone(ZoneId.systemDefault())}.getOrElse {ZonedDateTime.now().plusHours(1)})}
    var wait by remember(scope,offerId) {mutableStateOf(offer.waitMinutes?.toString() ?: "")}
    var delayAllowance by remember(scope,offerId) {mutableStateOf("")}
    var maxMiles by remember(scope,offerId) {mutableStateOf("10")}
    var maxMinutes by remember(scope,offerId) {mutableStateOf("30")}
    var confirmed by remember(scope,sourceKey) {mutableStateOf(false)}
    var conservative by remember(scope,offerId) {mutableStateOf(true)}
    var platforms by remember(scope,offerId) {mutableStateOf(gigPlatforms.keys.toSet())}
    var clock by remember {mutableStateOf(Instant.now())}
    LaunchedEffect(Unit) {while(true) {delay(2000);clock=Instant.now()}}
    Panel {
        Text("Earn on your way home",color=Route,fontSize=25.sp,fontWeight=FontWeight.Bold)
        Text("Compare going directly with completing this entire job first. Confirm the pickup and drop-off in ${offer.platform} while parked.")
        Text("Android's place service receives your searches. Road routing receives only the endpoints of routes you request. The street-map provider receives the map areas you view. Selected places stay in this screen and are not sent to your firm.",color=Muted,fontSize=12.sp)
    }
    Panel("Your destination & arrival") {
        NavigationRow("Must arrive by",{
            DatePickerDialog(context,{_,year,month,day->val selected=deadline.withDayOfMonth(1).withYear(year).withMonth(month+1).withDayOfMonth(day)
                TimePickerDialog(context,{_,hour,minute->deadline=selected.withHour(hour).withMinute(minute)},deadline.hour,deadline.minute,false).show()
            },deadline.year,deadline.monthValue-1,deadline.dayOfMonth).show()
        },deadline.format(DateTimeFormatter.ofPattern("MMM d, h:mm a")))
    }
    RoadRouteControls(repo,stateKey=sourceKey,initialPickup=offer.pickup,initialDropoff=offer.dropoff,
        initialDestination=repo.journal.mission?.destination ?: "",onRoute={journey=it;clock=Instant.now()},beforeCompare={
    Panel("The complete job") {
        Field("Pickup/service wait · minutes",wait,{wait=it})
        Field("Additional delay allowance · minutes",delayAllowance,{delayAllowance=it})
        Text("Include loading, shopping and hand-off time in service wait. Enter an extra delay allowance, including 0 only when you assume no extra delay. It expands the upper travel-time estimate.",color=Muted,fontSize=12.sp)
        Toggle("Pickup, drop-off and home cover all remaining stops",confirmed,{confirmed=it})
        if((offer.repositionMiles ?: 0.0)>0) Text("This offer includes additional repositioning. Its extra stops must be routed before a complete recommendation is possible.",color=Caution,fontSize=12.sp)
    }
    Panel("Your limits") {
        Field("Maximum extra miles",maxMiles,{maxMiles=it});Field("Maximum extra minutes",maxMinutes,{maxMinutes=it})
        Choice("Uncertainty tolerance",if(conservative) "Conservative" else "Balanced",linkedMapOf("Conservative" to "Conservative","Balanced" to "Balanced")) {conservative=it=="Conservative"}
        Text("Both choices enforce your deadline using the latest estimated arrival. Conservative also rejects wide time ranges.",color=Muted,fontSize=12.sp)
        Text("Preferred platforms",fontWeight=FontWeight.SemiBold)
        gigPlatforms.keys.forEach {platform->Toggle(platform,platform in platforms,{allowed->platforms=if(allowed) platforms+platform else platforms-platform})}
    }
    })
    if(journey==null) SideEffect {OfferRouteEvidenceCache.remove(scope,offerId)}
    journey?.let {roads->
        CompleteRoadMap(repo,roads)
        fun number(text: String)=text.trim().toDoubleOrNull() ?: Double.NaN
        val prefs=OfferRoadPreferences(deadline.toInstant(),number(wait),number(delayAllowance),number(maxMiles),number(maxMinutes),confirmed,conservative,platforms)
        val result=assessOfferRoad(offer,roads,prefs,repo.journal.goals,repo.journal.taxReservePercent ?: 0.0,
            reviewedOffers(repo.journal).any {it.id!=offer.id && it.isActiveWork()},clock)
        SideEffect {if(result.extraMiles!=null) OfferRouteEvidenceCache.put(scope,OfferRouteEvidence(offer,repo.journal.goals,repo.journal.taxReservePercent ?: 0.0,roads,prefs)) else OfferRouteEvidenceCache.remove(scope,offerId)}
        val tint=when(result.outcome) {"aligned","tradeoff"->Income;"skip"->Danger;else->Caution}
        Panel(when(result.outcome) {"aligned"->"Fits your journey";"tradeoff"->"Profitable route tradeoff";"skip"->"Skip this comparison";else->"More review needed"}) {
            Text(result.reason,color=tint,fontWeight=FontWeight.SemiBold,modifier=Modifier.testTag("offerRoute.result"))
            Text(String.format(Locale.US,"Go directly: %.1f mi · %.0f min",roads.direct.meters/1609.344,ceil(roads.direct.seconds/60)),color=Route)
            result.extraMiles?.let {Text(String.format(Locale.US,"Extra miles via this job: %+.1f mi",it),color=Route)}
            result.extraMinutes?.let {Text(String.format(Locale.US,"Extra time via this job: %+.1f to %+.1f min",it.first,it.second),color=Route)}
            result.latestArrival?.let {Text("Latest estimated arrival: ${it.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("h:mm a"))}",color=Route)}
            result.deadlineBufferMinutes?.let {Text("Deadline buffer: ${floor(it).toInt()} min",color=if(it<0) Danger else Route)}
            fun money(value: OfferMoneyBand?)=value?.let {if(it.lower==it.upper) usd(it.lower) else "${usd(it.lower)}–${usd(it.upper)}"} ?: "Unknown"
            Text("Job cash after reserve: ${money(result.financial?.cash)}")
            Text("Extra cash versus going directly: ${money(result.incrementalCash)}")
            Text("Operating costs and your configured reserve are included. Reserve is a planning allocation. Traffic, service delays and availability can change. Verify the actual offer in ${offer.platform} before accepting.",color=Muted,fontSize=12.sp)
        }
        Text("${roads.direct.provider} · Requested ${roads.direct.measuredAt}. Road data © OpenStreetMap contributors.",color=Muted,fontSize=11.sp)
    }
}
