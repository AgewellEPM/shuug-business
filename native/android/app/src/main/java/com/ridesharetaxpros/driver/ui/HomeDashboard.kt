package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.util.Locale

@Composable fun BrandHeader(compact: Boolean=false) {
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp),verticalAlignment=Alignment.CenterVertically) {
        Image(painterResource(R.drawable.brand_mark),null,Modifier.size(if(compact) 42.dp else 52.dp))
        Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text("Gig Tax Pros",fontWeight=FontWeight.Bold,fontSize=if(compact) 20.sp else 22.sp,letterSpacing=(-.6).sp)
            Text("POWERED BY SHUUG",fontSize=9.sp,letterSpacing=1.3.sp,color=Link)
        }
    }
}
@Composable private fun Metric(title: String,value: String,icon: ImageVector,tint: Color,modifier: Modifier=Modifier) {
    Row(modifier,verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        Icon(icon,null,Modifier.size(22.dp),tint=tint)
        Column {Text(value,fontSize=17.sp,fontWeight=FontWeight.SemiBold,color=tint);Text(title,fontSize=10.sp,color=Muted)}
    }
}
@Composable private fun QuickAction(title:String,icon:ImageVector,tint:Color,onClick:()->Unit,modifier:Modifier=Modifier) {
    Column(modifier.height(72.dp).background(panelGradient,RoundedCornerShape(17.dp)).border(.8.dp,Border.copy(alpha=.6f),RoundedCornerShape(17.dp))
        .clickable(onClick=onClick),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
        Icon(icon,title,Modifier.size(27.dp),tint=tint);Spacer(Modifier.height(8.dp));Text(title,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
    }
}
val homeTools=listOf("Trips","Money","Account","Alerts & reminders","Offer Capture Diagnostics","Tax & Goals","Ratings & reviews","Get help","Getting started","Sample shift")
@Composable fun HomeDashboard(repo:DriverRepository,navigate:(String)->Unit,selectTab:(String)->Unit,endDrive:()->Unit) {
    var menu by remember {mutableStateOf(false)}
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        Box {IconButton(onClick={menu=true},Modifier.size(28.dp)) {Icon(Icons.Default.Menu,"More tools")}
            DropdownMenu(menu,onDismissRequest={menu=false},containerColor=Panel) {homeTools.forEach {label->DropdownMenuItem(text={Text(label)},onClick={menu=false;navigate(label)})}}}
        Box(Modifier.weight(1f)) {BrandHeader(true)}
        IconButton(onClick={navigate("Tax & Goals")},Modifier.size(30.dp)) {Icon(Icons.Default.Forum,"Tax & Goals chat",tint=Route)}
        IconButton(onClick={navigate("Alerts & reminders")},Modifier.size(30.dp)) {Icon(Icons.Default.NotificationsNone,"Alerts and reminders")}
    }
    Text("Drive smarter · Earn more · Get home paid",fontSize=12.sp,color=Muted,modifier=Modifier.alignCenter())
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        QuickAction("Trips",Icons.Default.DirectionsCar,Route,{navigate("Trips")},Modifier.weight(1f))
        QuickAction("Expense",Icons.Default.ReceiptLong,ExpenseColor,{navigate("Add expense")},Modifier.weight(1f))
        QuickAction("Income",Icons.Default.Paid,Income,{navigate("Add income")},Modifier.weight(1f))
        QuickAction("Alerts",Icons.Default.Notifications,Caution,{navigate("Alerts & reminders")},Modifier.weight(1f))
    }
    val todayRecords=repo.journal.visible.map {it.record}.filter {it.date==today()}
    val rides=todayRecords.filter {it.kind=="trip" && it.trip().classification=="business" && it.trip().endedAt!=null}.map {RideProfit(it,repo.journal.goals)}
    val priced=rides.filter {it.net!=null};val net=priced.sumOf {it.net!!.toLong()};val minutes=priced.sumOf {it.minutes}
    Panel {
        Row {Text("Today’s driving",Modifier.weight(1f),fontWeight=FontWeight.SemiBold);Text(if(repo.journal.active!=null) "● Recording" else "✓ Saved records",fontSize=10.sp,color=Link)}
        Row(verticalAlignment=Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {Text(usd(net),fontSize=39.sp,fontWeight=FontWeight.Bold,color=if(net<0) Danger else Income);Text("Estimated net",fontSize=12.sp,color=Muted)}
            Column(horizontalAlignment=Alignment.End,modifier=Modifier.clickable {navigate("Goals")}) {Text(repo.journal.goals.dailyNetCents?.let {usd(it)} ?: "Set a goal",fontSize=20.sp,fontWeight=FontWeight.Bold,color=Link);Text("Net earnings target",fontSize=12.sp,color=Muted)}
        }
        repo.journal.goals.dailyNetCents?.takeIf {it>0}?.let {goal->
            LinearProgressIndicator(progress={(net.toFloat()/goal).coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(13.dp),color=Pink,trackColor=Color.White.copy(alpha=.12f))
            Text("${(net*100/goal).coerceIn(0,100)}% of goal · ${usd((goal-net).coerceAtLeast(0))} to go",fontSize=12.sp,color=Muted)
        }
        HorizontalDivider(color=Border.copy(alpha=.3f))
        Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            Metric("Per recorded\nhour",if(minutes>0) usd(net*60/minutes) else "—",Icons.Default.Paid,if(minutes>0) Income else Link,Modifier.weight(1f))
            Metric("Recorded\nwork time","${minutes.toInt()/60}h ${minutes.toInt()%60}m",Icons.Default.Schedule,Link,Modifier.weight(1f))
            Metric("Business\nmiles","%.1f mi".format(Locale.US,rides.sumOf {it.miles}),Icons.Default.AddRoad,Route,Modifier.weight(1f))
        }
        Text(if(priced.size<rides.size || priced.isEmpty()) "Add fares, known fees and vehicle cost to complete your profit picture." else "Recorded driving only; unrecorded idle time and tax are excluded.",fontSize=12.sp,color=Muted)
    }
    Panel {NavigationRow("Find an office & get help",{navigate("Get help")},"Locations · Phone help · Appointments")}
    Panel {Row(Modifier.clickable {selectTab("Go Home")},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.Home,null,Modifier.size(32.dp),tint=Route)
        Column(Modifier.weight(1f)) {Text("Get Paid Going Home",fontWeight=FontWeight.Bold,fontSize=18.sp);Text(repo.journal.mission?.let {"Finish near ${it.destination}. Earn on the way."} ?: "Set your destination. Earn on the way.",fontSize=12.sp,color=Muted)}
        Icon(Icons.Default.ChevronRight,null,tint=Route)
    }}
    PlatformLaunchers(repo,navigate)
    Panel("Is this job worth it?") {
        Text("Take a screenshot. Bring it here. Check the pay after costs.",color=Muted)
        Action("Show me how · Try the guide",{navigate("Screenshot guide")})
        Action("Choose screenshot",{navigate("Choose screenshot")},false)
    }
    Panel("Your last 7 days") {
        Text(usd(net),fontSize=34.sp,fontWeight=FontWeight.Bold,color=Income)
        if(rides.isEmpty()) {Icon(Icons.Default.ShowChart,null,tint=Muted);Text("Your graph starts with your first drive",fontWeight=FontWeight.SemiBold,color=Muted)}
        else Bars(insights(repo.journal.visible.map {it.record},repo.journal.goals,java.time.LocalDate.now().minusDays(6).toString(),today()).map {it.net.toDouble()})
        Text("Completed drives, fares and your vehicle cost power these numbers.",fontSize=12.sp,color=Muted)
    }
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
        PanelMetric("Business miles today","%.2f".format(Locale.US,rides.sumOf {it.miles}),Route,Modifier.weight(1f))
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
    TextButton(onClick={repo.run {shareBytes(repo,exportCSV(repo.journal).toByteArray(),"text/csv","GigTaxPros-${today()}.csv")}}) {Text("Export my records as CSV")}
}
private fun Modifier.alignCenter()=fillMaxWidth().wrapContentWidth(Alignment.CenterHorizontally)
@Composable private fun PanelMetric(title:String,value:String,tint:Color,modifier:Modifier=Modifier) {
    Column(modifier.background(panelGradient,RoundedCornerShape(20.dp)).padding(16.dp)) {Text(title,fontSize=12.sp,color=Muted);Text(value,fontSize=24.sp,fontWeight=FontWeight.Bold,color=tint)}
}
@Composable fun PlatformLaunchers(repo:DriverRepository,navigate:(String)->Unit) {
    val names=listOf("Lyft Driver","Uber Driver","Dasher","Spark Driver","Instacart Shopper","Amazon Flex","Grubhub Driver","Roadie Driver","Shipt Shopper","Gopuff Driver","Tasker","Rover","Wag! Caregiver","Favor Runner","Curri Driver","GoShare Driver","Veho Driver","Dispatch","Skipcart","Universal Delivery","In-store Shopper")
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(16.dp)) {names.forEach {name->
        Column(Modifier.width(64.dp).clickable {
            if(name=="Universal Delivery" || name=="In-store Shopper") navigate(name) else {
                val match=repo.app.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
                    .firstOrNull {it.loadLabel(repo.app.packageManager).toString().equals(name,true)}
                val launch=match?.activityInfo?.packageName?.let {repo.app.packageManager.getLaunchIntentForPackage(it)}
                if(launch!=null) repo.app.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                else repo.failure="$name is not installed. Install the provider’s official Android app, then return here to open it."
            }
        },horizontalAlignment=Alignment.CenterHorizontally) {
            val asset=platformAsset(name)
            val bitmap=remember(asset) {runCatching {repo.app.assets.open("platforms/$asset").use {android.graphics.BitmapFactory.decodeStream(it)}}.getOrNull()}
            if(bitmap!=null) Image(bitmap.asImageBitmap(),null,Modifier.size(38.dp))
            else Icon(if(name=="In-store Shopper") Icons.Default.ShoppingBasket else Icons.Default.LocalShipping,null,Modifier.size(38.dp),tint=if(name=="In-store Shopper") Income else Route)
            Spacer(Modifier.height(8.dp));Text(name,fontSize=10.sp,maxLines=2);Text(if(name.startsWith("Universal") || name=="In-store Shopper") "Work profile" else "Open app",fontSize=9.sp,color=Muted)
        }
    }}
}
private fun platformAsset(name:String)=mapOf("Lyft Driver" to "PlatformLyftIcon.jpg","Uber Driver" to "PlatformUberIcon.jpg","Dasher" to "PlatformDoorDashIcon.jpg","Spark Driver" to "PlatformSparkIcon.jpg","Instacart Shopper" to "PlatformInstacartIcon.jpg","Tasker" to "GigAppTaskrabbitTaskerIcon.jpg","Dispatch" to "GigAppDispatchDriverIcon.jpg","Skipcart" to "GigAppSkipcartDriverIcon.jpg")[name] ?: "GigApp${name.replace(" ","").replace("!","")}Icon.jpg"
