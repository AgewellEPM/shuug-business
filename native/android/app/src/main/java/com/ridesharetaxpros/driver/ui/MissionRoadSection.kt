package com.ridesharetaxpros.driver.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import java.time.Instant
import java.util.Locale
import kotlin.math.*
import kotlinx.coroutines.delay

@Composable fun MissionRoadSection(repo: DriverRepository,waitMinutes: Double?,navigate: (String)->Unit) {
    var roads by remember(repo.scope) {mutableStateOf<OfferRoadJourney?>(null)}
    var complete by remember(repo.scope) {mutableStateOf(false)}
    var clock by remember {mutableStateOf(Instant.now())}
    LaunchedEffect(Unit) {while(true) {delay(10000);clock=Instant.now()}}
    Panel("Get paid going home") {
        Text("While parked, select your destination and the full job. Compare current road routes, including pickup and onward travel.",fontSize=13.sp)
    }
    RoadRouteControls(repo,stateKey="mission",initialDestination=repo.journal.mission?.destination ?: "",showWaitingAreas=true,onRoute={roads=it;clock=Instant.now()},beforeCompare={
        Panel {
            Toggle("Pickup, drop-off and home cover the entire route",complete,{complete=it})
            Text("Confirm only when there are no other delivery stops or required repositioning. Add all pickup/service wait in the offer above.",color=Muted,fontSize=12.sp)
        }
    })
    roads?.let {route->
        CompleteRoadMap(repo,route)
        val comparison=missionRoadComparison(route,waitMinutes,complete,repo.journal.mission?.deadline,clock)
        Panel("Road comparison") {
            Text(String.format(Locale.US,"Direct: %.2f mi · %.0f min",route.direct.meters/1609.344,route.direct.seconds/60),fontWeight=FontWeight.SemiBold)
            val miles=(route.pickup.meters+route.delivery.meters+route.onward.meters)/1609.344
            val minutes=(route.pickup.seconds+route.delivery.seconds+route.onward.seconds)/60
            Text(String.format(Locale.US,"Via pickup and drop-off: %.2f mi · %.0f min driving",miles,minutes))
            comparison?.let {value->
                val change=value.distanceChangeMeters
                Text(if(abs(change)<160.9344) "Drop-off is about the same road distance from your destination." else
                    String.format(Locale.US,"Drop-off is %.2f mi %s your destination by road.",abs(change)/1609.344,if(change>0) "closer to" else "farther from"))
                Text(String.format(Locale.US,"Via the job: %.0f min %s than driving directly, before wait.",abs(value.extraTravelSeconds)/60,if(value.extraTravelSeconds>=0) "longer" else "shorter"))
                if(value.stale) Text("Your location or route estimate is old. Update your location and compare again before using a deadline estimate.",color=Caution,fontSize=12.sp)
                else value.deadlineBufferSeconds?.let {buffer->
                    Text(String.format(Locale.US,"Estimated %.0f min %s your deadline",abs(buffer)/60,if(buffer>=0) "before" else "after"),color=if(buffer>=0) Link else Danger)
                    Text("Includes your entered wait and confirmed stops. This point estimate is not a recommendation; use an offer's full analysis to include delay ranges and pay.",color=Muted,fontSize=12.sp)
                } ?: Text(if(repo.journal.mission==null) "Save a mission deadline to compare arrival time." else "Confirm the complete route and enter pickup/service wait above, including 0 when known, to compare the deadline.",color=Muted,fontSize=12.sp)
            }
            Text("${route.direct.provider} · Requested ${route.direct.measuredAt}. Road routes and traffic can change; compare again after conditions change.",color=Muted,fontSize=11.sp)
        }
    }
}
