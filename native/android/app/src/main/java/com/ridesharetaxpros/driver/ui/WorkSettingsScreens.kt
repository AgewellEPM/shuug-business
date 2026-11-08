package com.ridesharetaxpros.driver.ui

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.serialization.json.*

@Composable fun UniversalWorkScreen(repo:DriverRepository,title:String,navigate:(String)->Unit) {
    val shopping=title=="In-store Shopper";val scope=repo.scope
    val profile=repo.journal.universalWorkProfiles[title]
    var label by remember(scope,title) {mutableStateOf(profile?.workLabel ?: title)}
    var link by remember(scope,title) {mutableStateOf(profile?.appURL ?: "")};var notice by remember {mutableStateOf<String?>(null)}
    fun save() {
        val clean=label.trim();require(clean.isNotBlank() && clean.length<=100) {"Use a work or app name up to 100 characters."}
        val url=link.trim().takeIf {it.isNotEmpty()}
        url?.let {val uri=Uri.parse(it);require(uri.scheme=="https" && !uri.host.isNullOrBlank() && uri.userInfo==null) {"Use an HTTPS app or website link."}}
        require(scope==repo.scope) {"Your account changed. Reopen this work profile before saving."}
        repo.update {it.copy(universalWorkProfiles=it.universalWorkProfiles+(title to UniversalWorkProfile(clean,url)))}
        notice="Work profile saved on this phone."
    }
    Panel(title) {Text(if(shopping) "Track completed in-store work from its actual start and end time, earnings and fees. Enter 0 miles when no driving was part of that job." else "Track delivery work for any app or client. Use a custom label and record the actual job, paid time, earnings, fees and mileage.",color=Muted)}
    Panel("Your work profile") {
        Field("Work or app name",label,{label=it});Field("HTTPS app or website link · optional",link,{link=it})
        if(link.startsWith("https://")) NavigationRow("Open work app or website",{repo.run {openPublicLink(repo,link)}})
        Text("Your settings stay with this account on this phone. An app link opens only when you tap it; it does not connect an account or read offers.",color=Muted)
    }
    Panel("Cost & earnings goals") {
        NavigationRow("Set shared vehicle cost & net goals",{navigate("Goals")})
        Text("These are the same goals used by Earnings and Tax & Goals. A shopping job with exactly 0 recorded miles has 0 vehicle cost; other job expenses still need their own records and review.",color=Muted)
    }
    Action("Log completed job",{repo.run {save();navigate(if(shopping) "Log shopping job" else "Log delivery job")}},false)
    Text("Use actual completed work and payout details. A job record can sync with your firm after you connect. This does not accept a gig, start GPS recording, determine a deduction or file a return.",color=Muted)
    Action("Save work profile",{repo.run {save()}})
    notice?.let {Text(it,color=Income)}
}
@Composable fun ReserveHistoryScreen(repo:DriverRepository) {
    var vehicle by remember(repo.scope) {mutableStateOf(repo.journal.vehicleReservePercent?.toString() ?: "")}
    var tax by remember(repo.scope) {mutableStateOf(repo.journal.taxReservePercent?.toString() ?: "")}
    val first=java.time.LocalDate.now().minusDays(90).toString();val last=today()
    val records=repo.journal.visible.map {it.record}.filter {it.date in first..last}
    val rides=records.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}
        .map {RideProfit(it,repo.journal.goals)}.filter {it.net!=null && it.minutes>=1}
    fun hourly(rows:List<RideProfit>):Int?=rows.sumOf {it.minutes}.takeIf {it>0}?.let {minutes->kotlin.math.round(rows.sumOf {it.net!!.toLong()}*60/minutes).toInt()}
    Panel("Shift planner & two-hour estimate") {
        rides.groupBy {ride->val trip=ride.record.trip();java.time.Instant.parse(trip.startedAt).atZone(java.time.ZoneId.of(trip.timeZoneId ?: "UTC")).hour}.toSortedMap().forEach {(hour,rows)->
            hourly(rows)?.let {Text("%02d:00: %s/active hour · %d drives".format(java.util.Locale.US,hour,usd(it),rows.size))}
        }
        val rate=hourly(rides)
        if(rate!=null && rides.size>=3) {
            Text("Two active hours at your recorded average: ${usd(rate.toLong()*2)} estimated net",fontWeight=FontWeight.Bold)
            Text("Based on ${rides.size} completed drives in the last 90 days. It assumes two continuously booked hours; it does not predict demand, idle time, traffic or future earnings.",color=Muted)
        } else Text("Record at least three priced business drives to see a two-hour illustration. More observations improve context, not certainty.",color=Muted)
    }
    Panel("Neighborhood opportunities") {
        val groups=rides.filter {!it.record.trip().workArea.isNullOrBlank()}.groupBy {it.record.trip().workArea!!}
        if(groups.isEmpty())Text("Add a work area to completed drives to compare your recorded neighborhoods.",color=Muted)
        groups.toSortedMap().forEach {(area,rows)->hourly(rows)?.let {Text("$area · ${usd(it)}/active hour · ${rows.size} drives")}}
        Text("Your named areas are not live demand. A map of actual opportunities requires consented location and sufficient data.",color=Muted)
    }
    Panel("Vehicle health and tax reserves") {
        Text("Set your own percentages of recorded gross income to plan money to set aside. These are planning amounts only; no money moves and this is not a tax estimate or deduction determination.",color=Muted)
        Field("Tax reserve percent",tax,{tax=it});Field("Vehicle health percent",vehicle,{vehicle=it})
        Action("Save reserve targets",{repo.run {
            val taxPercent=tax.toDoubleOrNull();val vehiclePercent=vehicle.toDoubleOrNull()
            require(taxPercent!=null && vehiclePercent!=null && taxPercent.isFinite() && vehiclePercent.isFinite() && taxPercent in 0.0..100.0 && vehiclePercent in 0.0..100.0 && taxPercent+vehiclePercent<=100) {"Enter percentages from 0 to 100, with a combined total no greater than 100%."}
            repo.update {it.copy(vehicleReservePercent=vehiclePercent,taxReservePercent=taxPercent)}
        }})
        val savedTax=repo.journal.taxReservePercent;val savedVehicle=repo.journal.vehicleReservePercent
        if(savedTax!=null && savedVehicle!=null) {
            val gross=records.filter {it.kind=="income"}.sumOf {it.income().amountCents.toLong()}
            Text("Last 90 days of recorded income: ${usd(gross)}")
            Text("Tax planning: ${usd(kotlin.math.round(gross*savedTax/100).toLong())} · vehicle health: ${usd(kotlin.math.round(gross*savedVehicle/100).toLong())}")
            Text("Payout entries may include transfers or duplicated earnings. Review them before using reserve targets.",color=Muted)
        }
    }
}
@Composable fun ConnectedWorkScreen(repo:DriverRepository) {
    var summary by remember(repo.scope) {mutableStateOf<JsonObject?>(null)};var loading by remember {mutableStateOf(false)};var problem by remember {mutableStateOf<String?>(null)}
    val identity=repo.connection?.session?.token
    fun refresh(sync:Boolean=false) {val connection=repo.connection ?: return;loading=true;repo.run {try {
        val client=WorkspaceClient(connection)
        if(sync) client.customer("connections/argyle/sync","POST","{}".toByteArray())
        val data=Wire.parseToJsonElement(client.customer("connections/argyle/summary").toString(Charsets.UTF_8)).jsonObject
        if(repo.connection?.session?.token==identity) {summary=data;problem=null}
    } catch(error:Exception) {if(repo.connection?.session?.token==identity)problem=error.message} finally {loading=false}}}
    LaunchedEffect(repo.scope) {refresh()}
    Panel("Your work accounts") {
        Text("Link your gig accounts once. See the jobs and pay each service shares with your own client profile.")
        if(repo.connection==null) Text("Connect your invited client profile in Your account first.",color=Muted)
        summary?.let {data->
            fun value(key:String)=data[key]?.jsonPrimitive?.contentOrNull
            value("availability")?.let {Text(it,color=Muted)};value("status")?.let {Text("Connection: $it")}
            if(value("environment")=="sandbox") Text("Provider test records only",color=Caution)
            if(value("ready")=="true" || value("canDisconnect")=="true") Action("Connect or manage gig accounts",{repo.run {
                val connection=repo.connection ?: error("Connect your client profile first.")
                val result=Wire.parseToJsonElement(WorkspaceClient(connection).customer("connections/argyle/handoff","POST","{}".toByteArray()).toString(Charsets.UTF_8)).jsonObject
                require(repo.connection?.session?.token==connection.session.token)
                val url=result["url"]!!.jsonPrimitive.content;val uri=java.net.URI(url);val expected=java.net.URI(connection.origin)
                require(uri.scheme==expected.scheme && uri.host==expected.host && uri.port==expected.port && uri.path=="/api/website/customer/connections/argyle/handoff" && uri.userInfo==null && uri.fragment==null) {"The account connection returned an unexpected address."}
                openPublicLink(repo,url)
            }},enabled=!loading)
            if(value("ready")=="true") Action("Check for updates",{refresh(true)},false,!loading)
            value("lastSyncAt")?.let {Text("Last received: $it",fontSize=12.sp,color=Muted)}
            value("lastError")?.let {Text(it,color=Caution)}
        }
        if(loading) CircularProgressIndicator(color=Pink)
        problem?.let {Text(it,color=Caution)}
    }
    summary?.get("accounts")?.jsonArray?.forEach {value->val account=value.jsonObject
        Panel(account["name"]?.jsonPrimitive?.content ?: "Connected account") {
            Text(account["status"]?.jsonPrimitive?.content ?: "Status unavailable")
            Text("Provider refresh: ${account["refreshFrequency"]?.jsonPrimitive?.contentOrNull ?: "not confirmed"}",color=Muted)
            account["limitations"]?.jsonPrimitive?.contentOrNull?.let {Text(it,color=Muted)}
        }
    }
    Panel("Jobs and pay received") {
        val records=summary?.get("records")?.jsonArray ?: JsonArray(emptyList())
        if(records.isEmpty()) Text("No work records have arrived yet.",color=Muted)
        records.take(100).forEach {value->val record=value.jsonObject
            Text(record["platform"]?.jsonPrimitive?.contentOrNull ?: "Connected work",fontWeight=FontWeight.SemiBold)
            Text("${record["kind"]?.jsonPrimitive?.contentOrNull ?: "Record"} · ${record["status"]?.jsonPrimitive?.contentOrNull ?: "unknown"}",color=Muted)
            record["grossPayCents"]?.jsonPrimitive?.longOrNull?.let {Text("Gross pay: ${usd(it)}",color=Income)}
        }
    }
    Text("Provider history is separate from your tax journal until reviewed. These updates are not a live feed of incoming offers.",color=Muted)
}
