package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material.icons.outlined.MonetizationOn
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.util.Locale

@Composable fun BrandHeader(compact: Boolean=false) {
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.CenterVertically) {
        Image(painterResource(R.drawable.brand_mark),null,Modifier.size(if(compact) 42.dp else 52.dp))
        Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text("Gig Tax Pros",fontWeight=FontWeight.Bold,fontSize=if(compact) 20.sp else 22.sp,letterSpacing=(-.6).sp)
        }
    }
}
private val homeRoadLanes by lazy {
    ImageVector.Builder("Home road lanes",24.dp,24.dp,24f,24f).apply {
        path(fill=SolidColor(Color.Black)) {
            moveTo(8f,3f);lineTo(10f,3f);lineTo(5f,21f);lineTo(2f,21f);close()
            moveTo(14f,3f);lineTo(16f,3f);lineTo(22f,21f);lineTo(19f,21f);close()
            moveTo(11.4f,3f);lineTo(12.6f,3f);lineTo(12.6f,7f);lineTo(11.4f,7f);close()
            moveTo(11.4f,10f);lineTo(12.6f,10f);lineTo(12.6f,14f);lineTo(11.4f,14f);close()
            moveTo(11.4f,17f);lineTo(12.6f,17f);lineTo(12.6f,21f);lineTo(11.4f,21f);close()
        }
    }.build()
}
@Composable private fun Metric(title: String,value: String,icon: ImageVector,tint: Color,modifier: Modifier=Modifier) {
    Row(modifier,verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        Icon(icon,null,Modifier.size(21.dp),tint=tint)
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text(value,fontSize=17.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,color=tint,maxLines=1,softWrap=false,overflow=TextOverflow.Ellipsis)
            Text(title,fontSize=10.sp,lineHeight=12.sp,fontWeight=FontWeight.Medium,color=Muted,maxLines=2,overflow=TextOverflow.Ellipsis)
        }
    }
}
@Composable private fun QuickAction(title:String,icon:ImageVector,tint:Color,onClick:()->Unit,modifier:Modifier=Modifier,count:Int=0) {
    Box(modifier) {
    Column(Modifier.fillMaxWidth().height(72.dp).background(panelGradient,RoundedCornerShape(17.dp)).border(.8.dp,Border.copy(alpha=.6f),RoundedCornerShape(17.dp))
        .clickable(onClick=onClick),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
        Icon(icon,title,Modifier.size(27.dp),tint=tint);Spacer(Modifier.height(8.dp));Text(title,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
    }
    if(count>0)Badge(Modifier.align(Alignment.TopEnd),containerColor=tint,contentColor=Ink) {Text(count.coerceAtMost(99).toString())}
    }
}
private val homeTools=listOf("Trips" to "Trips","Money" to "Money","Account" to "Account","Alerts & reminders" to "Alerts & reminders",
    "Offer Capture Diagnostics" to "Offer Capture Diagnostics","Tax & Goals chat" to "Tax & Goals","Ratings & reviews" to "Ratings & reviews",
    "Find an office & get help" to "Get help","Getting-started video" to "Getting started","Explore a sample shift" to "Sample shift")
@Composable private fun HomeToolsMenu(expanded:Boolean,dismiss:()->Unit,navigate:(String)->Unit) {
    DropdownMenu(expanded,onDismissRequest=dismiss,modifier=Modifier.width(250.dp).border(.8.dp,Color(0xFF3B3B4B),RoundedCornerShape(32.dp)),offset=DpOffset(0.dp,(-28).dp),
        shape=RoundedCornerShape(32.dp),containerColor=Color(0xFF1A1923),tonalElevation=0.dp,shadowElevation=16.dp) {
        Column(Modifier.padding(vertical=4.dp)) {
            homeTools.forEach {(label,route)->
                val title=when(label) {
                    "Offer Capture Diagnostics"->"Offer Capture\nDiagnostics"
                    "Find an office & get help"->"Find an office &\nget help"
                    "Getting-started video"->"Getting-\nstarted video"
                    "Explore a sample shift"->"Explore a\nsample shift"
                    else->label
                }
                Row(Modifier.fillMaxWidth().heightIn(min=42.dp).clickable {navigate(route)}.padding(horizontal=24.dp,vertical=8.dp),
                    verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                    Icon(when(route) {
                        "Trips"->Icons.Default.DirectionsCar;"Money"->Icons.Default.ReceiptLong;"Account"->Icons.Default.AccountCircle;"Alerts & reminders"->Icons.Default.NotificationsNone
                        "Offer Capture Diagnostics"->Icons.Default.MonitorHeart;"Tax & Goals"->Icons.Default.Forum;"Ratings & reviews"->Icons.Default.Reviews
                        "Get help"->Icons.Default.Map;"Getting started"->Icons.Default.PlayCircle;else->Icons.Default.AutoAwesome
                    },null,Modifier.size(24.dp),tint=Pink)
                    Text(title,Modifier.weight(1f),fontSize=17.sp,lineHeight=22.sp,fontWeight=FontWeight.Normal,color=Color.White)
                }
            }
        }
    }
}
@Composable fun HomeDashboard(repo:DriverRepository,navigate:(String)->Unit,selectTab:(String)->Unit,endDrive:()->Unit) {
    var menu by remember {mutableStateOf(false)}
    val exportJournal=rememberJournalExport(repo)
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min=44.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
            Box {
                IconButton(onClick={menu=true},Modifier.size(28.dp)) {Icon(Icons.Default.Menu,"More tools")}
                HomeToolsMenu(menu,{menu=false}) {route->menu=false;navigate(route)}
            }
            Box(Modifier.weight(1f)) {BrandHeader(true)}
            IconButton(onClick={navigate("Tax & Goals")},Modifier.size(30.dp)) {Icon(Icons.Default.Forum,"Tax & Goals chat",tint=Route)}
            IconButton(onClick={navigate("Alerts & reminders")},Modifier.size(30.dp)) {Icon(Icons.Default.NotificationsNone,"Alerts and reminders")}
        }
        Text("Drive smarter · Earn more · Get home paid",fontSize=12.sp,lineHeight=15.sp,fontWeight=FontWeight.Medium,color=Muted,modifier=Modifier.alignCenter())
    }
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        QuickAction("Trips",Icons.Default.DirectionsCar,Route,{navigate("Trips")},Modifier.weight(1f))
        QuickAction("Expense",Icons.Default.ReceiptLong,ExpenseColor,{navigate("Add expense")},Modifier.weight(1f))
        QuickAction("Income",Icons.Default.Paid,Income,{navigate("Add income")},Modifier.weight(1f))
        QuickAction("Alerts",Icons.Default.Notifications,Caution,{navigate("Alerts & reminders")},Modifier.weight(1f),repo.journal.tripAlerts.count {it.scope==repo.scope && it.handledAt==null && runCatching {java.time.Instant.parse(it.expiresAt)>java.time.Instant.now()}.getOrDefault(false)})
    }
    val todayRecords=repo.journal.visible.map {it.record}.filter {it.date==today()}
    val rides=todayRecords.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}.map {RideProfit(it,repo.journal.goals)}
    val priced=rides.filter {it.net!=null};val dailyNet=priced.sumOf {it.net!!.toLong()}
    val hourly=recordedHourlySummary(priced);val recordedMinutes=rides.sumOf {it.minutes}
    val mission=repo.journal.mission
    val net=mission?.let {active->val first=java.time.Instant.parse(active.startedAt);val end=minOf(java.time.Instant.now(),java.time.Instant.parse(active.deadline))
        repo.journal.visible.map {it.record}.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}
            .filter {java.time.Instant.parse(it.trip().startedAt)>=first && java.time.Instant.parse(it.trip().endedAt)<=end}.sumOf {RideProfit(it,repo.journal.goals).net?.toLong() ?: 0L}
    } ?: dailyNet
    val target=mission?.targetCents ?: repo.journal.goals.dailyNetCents
    Panel(accent=if(net<0)Danger else Income,highlight=true) {
        Row {Text(if(mission==null) "Today’s driving" else "Your shift mission",Modifier.weight(1f),fontWeight=FontWeight.SemiBold);Row(Modifier.background((if(repo.journal.active!=null) Route else Purple).copy(alpha=.13f),RoundedCornerShape(50)).padding(horizontal=9.dp,vertical=5.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            Icon(if(repo.journal.active!=null) Icons.Default.FiberManualRecord else Icons.Default.CheckCircleOutline,null,Modifier.size(10.dp),tint=if(repo.journal.active!=null) Route else Link)
            Text(if(repo.journal.active!=null) "Recording" else "Saved records",fontSize=10.sp,lineHeight=12.sp,fontWeight=FontWeight.SemiBold,color=if(repo.journal.active!=null) Route else Link)
        }}
        Row(verticalAlignment=Alignment.CenterVertically) {
            Column(Modifier.weight(1f).alignByBaseline(),verticalArrangement=Arrangement.spacedBy(4.dp)) {Text(usd(net),fontSize=39.sp,lineHeight=47.sp,letterSpacing=(-1.2).sp,fontWeight=FontWeight.Bold,color=if(net<0) Danger else Income,maxLines=1,softWrap=false);Text("Estimated net",fontSize=12.sp,lineHeight=15.sp,color=Muted)}
            Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(6.dp),modifier=Modifier.alignByBaseline().clickable {navigate("Goals")}) {Text(target?.let {usd(it)} ?: "Set a goal",fontSize=20.sp,lineHeight=24.sp,fontWeight=FontWeight.Bold,color=Link);Text("Net earnings target",fontSize=12.sp,lineHeight=15.sp,color=Muted)}
        }
        target?.takeIf {it>0}?.let {goal->
            LinearProgressIndicator(progress={(net.toFloat()/goal).coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(13.dp),color=Pink,trackColor=Color.White.copy(alpha=.12f))
            Text("${(net*100/goal).coerceIn(0,100)}% of goal · ${usd((goal-net).coerceAtLeast(0))} to go",fontSize=12.sp,color=Muted)
        }
        HorizontalDivider(color=Border.copy(alpha=.3f))
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            Metric("Per recorded hour",hourly.hourlyCents?.let(::usd) ?: "—",Icons.Outlined.MonetizationOn,if(hourly.hourlyCents!=null) {if(hourly.timedNetCents<0)Danger else Income} else Link,Modifier.weight(1f))
            Metric("Recorded work time","${recordedMinutes.toInt()/60}h ${recordedMinutes.toInt()%60}m",Icons.Default.Schedule,Link,Modifier.weight(1f))
            Metric("Business miles","%.1f mi".format(Locale.US,rides.sumOf {it.miles}),homeRoadLanes,Route,Modifier.weight(1f))
        }
        Text(if(priced.size<rides.size || priced.isEmpty() || hourly.timedCount<priced.size) "Add fares, known fees, vehicle cost and recorded work time to complete your profit picture." else "Recorded driving only; unrecorded idle time and tax are excluded.",fontSize=12.sp,color=Muted)
    }
    Panel {Row(Modifier.fillMaxWidth().clickable {navigate("Get help")},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.Map,null,Modifier.size(30.dp),tint=Pink)
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text("Find an office & get help",fontSize=17.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold)
            Text("Locations · Phone help · Appointments",fontSize=12.sp,lineHeight=15.sp,color=Muted)
        }
        Icon(Icons.Default.ChevronRight,null,Modifier.size(20.dp),tint=Muted)
    }}
    Box(Modifier.fillMaxWidth().background(panelGradient,RoundedCornerShape(22.dp)).border(1.dp,Route.copy(alpha=.65f),RoundedCornerShape(22.dp)).clickable {selectTab("Go Home")}) {
    Row(Modifier.fillMaxWidth().padding(16.dp).padding(bottom=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.Home,null,Modifier.size(32.dp),tint=Route)
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(5.dp)) {Text("Get Paid Going Home",fontWeight=FontWeight.Bold,fontSize=18.sp,lineHeight=22.sp);Text(repo.journal.mission?.let {"Finish near ${it.destination}. Earn on the way."} ?: "Set your destination. Earn on the way.",fontSize=12.sp,lineHeight=15.sp,color=Muted)}
        Icon(Icons.Default.ChevronRight,null,tint=Route)
    }
    Canvas(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(28.dp)) {for(index in 0..6) {
        val start=index/6f*size.width;val line=Path().apply {moveTo(start,size.height);cubicTo(start,size.height*.4f,size.width*.68f,size.height*.5f,size.width*.58f,0f)}
        drawPath(line,Brush.linearGradient(listOf(Purple.copy(alpha=.3f),Pink.copy(alpha=.85f))),style=Stroke(if(index==3)2.dp.toPx() else .7.dp.toPx()))
    }}
    }
    PlatformLaunchers(repo,navigate)
    Panel("Is this job worth it?") {
        Text("Take a screenshot. Bring it here. Check the pay after costs.",color=Muted)
        Action("Show me how · Try the guide",{navigate("Screenshot guide")})
        Action("Choose screenshot",{navigate("Choose screenshot")},false)
    }
    val weekFirst=java.time.LocalDate.now().minusDays(6);val allRecords=repo.journal.visible.map {it.record}
    val weekTotals=insights(allRecords,repo.journal.goals,weekFirst.toString(),today()).associateBy {it.date}
    val weekDays=(0..6).map {weekFirst.plusDays(it.toLong()).toString()}.map {weekTotals[it] ?: DayTotals(it)}
    val weekRides=allRecords.filter {it.kind=="trip" && it.date in weekFirst.toString()..today() && it.trip().classification=="business" && it.trip().endedAt!=null}.map {RideProfit(it,repo.journal.goals)}
    EarningsPulse(weekDays,weekRides,7)
    TextButton(onClick={navigate("Sample shift")}) {Icon(Icons.Default.AutoAwesome,null);Spacer(Modifier.width(8.dp));Text("Explore charts & offers with sample data")}
    val active=repo.journal.active?.record?.trip()
    Panel(if(active==null) "Ready for your next drive" else "Drive in progress") {
        if(active==null) {
            Text("Mileage saved as you drive.",fontSize=22.sp,fontWeight=FontWeight.Bold)
            Text("Start a drive, then end it when you arrive. Recording continues while the phone locks; stopping this app can interrupt tracking.",color=Muted)
            Action("▷ Start a drive",{navigate("Start a drive")})
        } else {
            Text("%.2f mi".format(Locale.US,active.distanceMeters/1609.344),fontSize=48.sp,fontWeight=FontWeight.Bold)
            Text(repo.trackingStatus,color=Muted)
            if(active.hasGaps) Text("Some mileage needs review because location was interrupted or imprecise.",color=Caution)
            Action("End drive & save",endDrive,false)
        }
    }
    Text(if(repo.connection==null) "Saved on this phone" else "${repo.journal.entries.count {it.pendingMutationId!=null}} changes waiting to sync",fontSize=12.sp,color=Muted)
    Row(horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        PanelMetric("Business miles today","%.2f".format(Locale.US,todayRecords.filter {it.kind=="trip" && it.trip().classification=="business"}.sumOf {it.trip().distanceMeters}/1609.344),Route,Modifier.weight(1f))
        PanelMetric("Expenses today",usd(todayRecords.filter {it.kind=="expense"}.sumOf {it.expense().amountCents}),ExpenseColor,Modifier.weight(1f))
    }
    PanelMetric("Income today",usd(todayRecords.filter {it.kind=="income"}.sumOf {it.income().amountCents}),Income)
    repo.journal.placePrompts.filterNot {it.dismissed}.forEach {item->Panel("Near ${item.merchant}") {
        Text("Did you make a purchase? ${expenseCategories[item.category]}")
        NavigationRow("Log expense",{navigate("Prompt:${item.id}")})
        TextButton(onClick={repo.run {repo.update {it.copy(placePrompts=it.placePrompts.map {p->if(p.id==item.id)p.copy(dismissed=true) else p})}}}) {Text("Not a purchase")}
    }}
    Action("Add expense",{navigate("Add expense")},false)
    Action("Add income",{navigate("Add income")},false)
    Action("Earn $20 + points · Refer a tax-prep client",{navigate("Driver Rewards")},false)
    if(repo.connection==null) Text("Your records stay on this phone until you connect your invited client account.",fontSize=12.sp,color=Muted)
    Text("Review trip classifications and receipt details. Earnings uses your recorded fares and costs; recorded mileage is not a calculated tax deduction.",fontSize=12.sp,color=Muted)
    TextButton(onClick=exportJournal) {Text("Export my records as CSV")}
}
private fun Modifier.alignCenter()=fillMaxWidth().wrapContentWidth(Alignment.CenterHorizontally)
@Composable private fun PanelMetric(title:String,value:String,tint:Color,modifier:Modifier=Modifier) {
    Column(modifier.background(panelGradient,RoundedCornerShape(20.dp)).padding(16.dp)) {Text(title,fontSize=12.sp,color=Muted);Text(value,fontSize=24.sp,fontWeight=FontWeight.Bold,color=tint)}
}
@Composable fun PlatformLaunchers(repo:DriverRepository,navigate:(String)->Unit) {
    val names=gigAppCatalog.map {it.name}+listOf("Universal Delivery","In-store Shopper")
    Panel(inset=12.dp) {Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal=3.dp).padding(bottom=4.dp),horizontalArrangement=Arrangement.spacedBy(14.dp)) {names.forEach {name->
        Column(Modifier.width(66.dp).clickable {
            if(name=="Universal Delivery" || name=="In-store Shopper") navigate(name) else {
                val app=gigAppCatalog.first {it.name==name}
                val launch=repo.app.packageManager.getLaunchIntentForPackage(app.packageName)
                runCatching {
                    if(launch!=null)repo.app.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    else {
                        val market=Intent(Intent.ACTION_VIEW,Uri.parse("market://details?id=${app.packageName}")).setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        try {repo.app.startActivity(market)}catch(_:android.content.ActivityNotFoundException) {openPublicLink(repo,app.storeURL)}
                    }
                }.onFailure {repo.failure="$name and its official store listing could not be opened. Check your installed apps and connection."}
            }
        },horizontalAlignment=Alignment.CenterHorizontally) {
            val asset=platformAsset(name)
            val bitmap=remember(asset) {runCatching {repo.app.assets.open("platforms/$asset").use {android.graphics.BitmapFactory.decodeStream(it)}}.getOrNull()}
            if(bitmap!=null) Image(bitmap.asImageBitmap(),null,Modifier.size(38.dp).clip(RoundedCornerShape(9.dp)))
            else Box(Modifier.size(38.dp).background(Panel,RoundedCornerShape(9.dp)).border(1.dp,(if(name=="In-store Shopper") Income else Route).copy(alpha=.7f),RoundedCornerShape(9.dp)),contentAlignment=Alignment.Center) {Icon(if(name=="In-store Shopper") Icons.Default.ShoppingBasket else Icons.Default.LocalShipping,null,Modifier.size(23.dp),tint=if(name=="In-store Shopper") Income else Route)}
            Spacer(Modifier.height(6.dp));Text(name,fontSize=10.sp,lineHeight=12.sp,fontWeight=FontWeight.SemiBold,maxLines=2,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth().heightIn(min=24.dp));Spacer(Modifier.height(6.dp));Text(if(name.startsWith("Universal") || name=="In-store Shopper") "Configure" else "Open app",fontSize=9.sp,lineHeight=11.sp,color=Link)
        }
    }}}
}
private fun platformAsset(name:String)=gigAppCatalog.firstOrNull {it.name==name}?.iconFile ?: ""
