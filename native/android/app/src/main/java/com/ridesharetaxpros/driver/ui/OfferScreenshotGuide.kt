package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.net.Uri
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*

/** Isolated practice state. These taps never write to a journal or read a screen. */
@Composable fun ScreenshotGuideScreen(navigate: (String)->Unit,done: ()->Unit) {
    var step by rememberSaveable {mutableStateOf(0)}
    var power by rememberSaveable {mutableStateOf(false)}
    var volume by rememberSaveable {mutableStateOf(false)}
    var saved by rememberSaveable {mutableStateOf(false)}
    var share by rememberSaveable {mutableStateOf(false)}
    var stage by rememberSaveable {mutableStateOf(0)}
    var payout by rememberSaveable {mutableStateOf("7.50")}
    val context=LocalContext.current
    val focus=LocalFocusManager.current
    val scroll=rememberScrollState()
    val titles=listOf("Take a screenshot","Save the picture","Pick a way to bring it in","Bring the picture in","Check the numbers","See what you could keep")
    val cents=runCatching {StatementImport.cents(payout)}.getOrNull()?.takeIf {it in 0..100_000_000}
    val result=cents?.let {assessReviewedOffer(ReviewedGigOffer(payoutCents=it,guaranteedCents=it,
        additionalCostsCents=0,totalMiles=1.6,workingMinutes=20.0),50.0,2000)}
    val ready=when(step) {0->power&&volume;1->saved;3->stage>=if(share) 5 else 1;4->result?.profit!=null;else->false}
    fun move(next: Int) {focus.clearFocus();step=next.coerceIn(0,5)}
    fun restart() {power=false;volume=false;saved=false;share=false;stage=0;payout="7.50";move(0)}
    fun open(url: String) {runCatching {context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}}
    LaunchedEffect(step) {scroll.scrollTo(0)}
    Column(Modifier.fillMaxSize().background(Ink)) {
        Column(Modifier.weight(1f).verticalScroll(scroll).padding(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                Text("✦ PRACTICE · NOTHING IS SAVED",color=Link,fontSize=10.sp,fontWeight=FontWeight.Bold)
                Text("${step+1} of 6",color=Muted,fontSize=11.sp)
            }
            LinearProgressIndicator(progress={(step+1)/6f},modifier=Modifier.fillMaxWidth(),color=Pink,trackColor=Border.copy(alpha=.3f))
            Text(titles[step],fontSize=31.sp,fontWeight=FontWeight.Bold,modifier=Modifier.testTag("guide.title"))
            when(step) {
                0 -> {
                    Text("Park safely first. Open a job offer in your gig app.",fontWeight=FontWeight.SemiBold)
                    Text("Press Power + Volume down together. Let go right away. Do not hold them down.")
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically) {
                        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                            GuideTarget("Volume down",volume,"guide.hardware.volume",compact=true) {volume=true}
                        }
                        Column(Modifier.weight(3f).background(Color.Black,RoundedCornerShape(30.dp))
                            .border(2.dp,Border,RoundedCornerShape(30.dp)).padding(10.dp)) {
                            Text("10:25",Modifier.padding(8.dp),fontSize=10.sp,color=Color.White)
                            GuideOfferImage(Modifier.fillMaxWidth().height(310.dp))
                        }
                        Column(Modifier.weight(1f)) {GuideTarget("Power",power,"guide.hardware.power",compact=true) {power=true}}
                    }
                    Text("The pink targets show the buttons to use. These taps are practice; use the real buttons on your phone's edge for an actual screenshot.",color=Muted,fontSize=12.sp)
                    Text("This is DoorDash's published offer example. Your app may look different.",color=Muted,fontSize=12.sp)
                    TextButton(onClick={open("https://help.doordash.com/en-us/dashers/article/redesigned-accept-modal")}) {Text("DoorDash's example screen ↗")}
                    TextButton(onClick={open("https://support.google.com/android/answer/9075928")}) {Text("Android screenshot steps ↗")}
                }
                1 -> {
                    Text("Your Android phone saves a screenshot automatically. Tap the practice preview to find the picture.")
                    GuideOfferImage(Modifier.fillMaxWidth().height(350.dp))
                    if(saved) GuideSuccess("Practice picture saved. Find your real screenshot in Photos or your gallery.")
                    else GuideTarget("Open the saved screenshot",false,"guide.save.photo") {saved=true}
                    Text("The preview may disappear after a few seconds. The saved picture remains in Screenshots in your photo or gallery app.",color=Muted,fontSize=12.sp)
                }
                2 -> {
                    Text("Both ways work. Let's try one with our practice picture.")
                    GuideTarget("Choose screenshot",false,"guide.route.picker") {share=false;stage=0;move(3)}
                    Text("Come back to Gig Tax Pros. Tap Choose screenshot on Home or Offers.",color=Muted,fontSize=13.sp)
                    Action("Try sharing from Photos",{share=true;stage=0;move(3)},primary=false)
                    Text("To switch apps, swipe up from the bottom and pause, or tap the Overview button. Choose Gig Tax Pros.",color=Muted,fontSize=12.sp)
                }
                3 -> if(!share) {
                    Text("This is a practice photo picker. Tap the job picture.")
                    if(stage==0) Box(Modifier.fillMaxWidth().border(2.dp,Pink,RoundedCornerShape(18.dp))
                        .clickable {stage=1}.padding(8.dp).testTag("guide.photo")) {
                        GuideOfferImage(Modifier.fillMaxWidth().height(370.dp))
                    } else GuideSuccess("Picture chosen. Next, check the numbers we read.")
                    Text("For a real job, choose its gig app before opening the picker. You can cancel the picker at any time.",color=Muted,fontSize=12.sp)
                } else {
                    Text("Android's share sheet sends only the image you choose. In a real share, select Gig Tax Pros as the receiving app.",color=Muted,fontSize=12.sp)
                    when(stage) {
                        0 -> {Text("Open Photos or your gallery. Tap your job screenshot. Try it here.")
                            Box(Modifier.fillMaxWidth().border(2.dp,Pink,RoundedCornerShape(18.dp)).clickable {stage=1}.padding(8.dp).testTag("guide.photo")) {
                                GuideOfferImage(Modifier.fillMaxWidth().height(340.dp))}}
                        1 -> {GuideOfferImage(Modifier.fillMaxWidth().height(300.dp));Text("Tap Share — Android's connected-dots icon.")
                            GuideTarget("Share",false,"guide.share") {stage=2}}
                        2 -> {Text("Tap Gig Tax Pros in the row of apps.")
                            GuideTarget("Gig Tax Pros",false,"guide.share.app") {stage=3}
                            Text("Can't see it? Swipe across the apps or tap More. You can also use Choose screenshot inside Gig Tax Pros.",color=Muted,fontSize=12.sp)}
                        3 -> {Text("Choose the right gig app, then read the shared offer.")
                            GuideTarget("Read shared offer",false,"guide.share.read") {stage=4}}
                        4 -> {Text("Review the captured details in Gig Tax Pros → Offers.")
                            GuideTarget("Keep offer and review",false,"guide.share.keep") {stage=5}
                            Text("You can open Offers even if notifications are off.",color=Muted,fontSize=12.sp)}
                        else -> GuideSuccess("Practice share complete. Next, review the numbers.")
                    }
                }
                4 -> {
                    Text("Pictures can be read wrong. Check pay, all miles, time and costs before saving a real job.")
                    GuideOfferImage(Modifier.fillMaxWidth().height(360.dp).border(2.dp,Pink,RoundedCornerShape(18.dp)))
                    Text("“Deliver by 10:45 AM” is a deadline. The number beside Accept is a countdown. Neither tells us all your working time.",color=Muted,fontSize=13.sp)
                    Panel("PRACTICE NUMBERS") {
                        Field("Guaranteed pay, including tips ($)",payout,{payout=it})
                        Text("Miles shown: 1.6 · Practice time: 20 minutes")
                        Text("For this lesson, assume 1.6 miles covers all driving and the job takes 20 minutes. Those are practice assumptions. For a real job, include extra driving, pickup and waiting time.",color=Muted,fontSize=12.sp)
                        Text("Practice costs: 50¢ per mile, $0 extra costs, no money set aside, and a $20/hour goal.",color=Muted,fontSize=12.sp)
                    }
                    Text("Try changing the pay. The result will change too.",color=Link)
                    if(result?.profit==null) Text("Enter a valid dollar amount.",color=Color(0xFFFFE66D))
                }
                else -> {
                    result?.let {value->Panel("PRACTICE ESTIMATE") {
                        Text(value.profit?.let {usd(it.lower)} ?: "—",color=if(value.outcome=="loss") Color(0xFFFF5D87) else Income,
                            fontSize=48.sp,fontWeight=FontWeight.Bold,modifier=Modifier.testTag("guide.result.net"))
                        Text("after vehicle costs, before any tax savings")
                        Text("Vehicle cost: ${value.vehicle?.let {usd(it.lower)} ?: "—"}")
                        Text("Per working hour: ${value.hourly?.let {if(it.lower==it.upper) usd(it.lower) else "${usd(it.lower)}–${usd(it.upper)}"} ?: "—"}")
                        Text(when(value.outcome) {"meetsGoal"->"This example meets the $20/hour goal.";"loss"->"This example costs more than it pays.";else->"This example is below the $20/hour goal."},fontWeight=FontWeight.Bold)
                    }}
                    Text("For your own job, use your own costs. Missing details or extra driving can change the result. Check that the job is still there, then choose in the gig app.")
                    Action("Try my own screenshot",{navigate("Choose screenshot")})
                    Action("Set up sharing from Photos",{navigate("Offer reader")},primary=false)
                    TextButton(onClick={restart()}) {Text("Try the guide again")}
                    Text("Practice jobs never go into your earnings or saved offers.",color=Muted,fontSize=12.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        HorizontalDivider(color=Border.copy(alpha=.2f))
        Row(Modifier.fillMaxWidth().padding(16.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
            if(step>0) OutlinedButton(onClick={move(step-1)},Modifier.weight(1f).heightIn(min=48.dp).testTag("guide.back")) {Text("Back")}
            if(step!=2 && step<5) Button(onClick={move(step+1)},enabled=ready,
                modifier=Modifier.weight(1f).heightIn(min=48.dp).testTag("guide.next"),colors=ButtonDefaults.buttonColors(containerColor=Pink)) {
                Text(if(step==4) "Check this job" else "Next")
            }
            if(step==5) Button(onClick=done,Modifier.weight(1f).heightIn(min=48.dp).testTag("guide.done"),colors=ButtonDefaults.buttonColors(containerColor=Pink)) {Text("Done")}
        }
    }
}

@Composable private fun GuideOfferImage(modifier: Modifier=Modifier) {
    val context=LocalContext.current
    val original=remember {BitmapFactory.decodeResource(context.resources,R.drawable.doordash_offer_reference,
        BitmapFactory.Options().apply {inScaled=false}).asImageBitmap()}
    Column(modifier,horizontalAlignment=Alignment.CenterHorizontally) {
        Text("DOORDASH EXAMPLE · PRACTICE ONLY",fontSize=8.sp,color=Link,modifier=Modifier.padding(bottom=6.dp))
        // Same viewport as iOS: keep the publisher's original600×586 intact,
        // showing only the new-design screen at x343,y29,width229,height491.
        Canvas(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(16.dp)).semantics {
            contentDescription="DoorDash published example: 7.50 dollars, 1.6 miles. Practice only."
        }) {
            val width=minOf(size.width,size.height*229f/491f);val height=width*491f/229f
            drawImage(original,srcOffset=IntOffset(343,29),srcSize=IntSize(229,491),
                dstOffset=IntOffset(((size.width-width)/2).toInt(),((size.height-height)/2).toInt()),
                dstSize=IntSize(width.toInt(),height.toInt()))
        }
    }
}

@Composable private fun GuideTarget(label: String,selected: Boolean,id: String,compact:Boolean=false,onClick: ()->Unit) {
    OutlinedButton(onClick=onClick,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp).testTag(id),
        shape=RoundedCornerShape(14.dp),border=androidx.compose.foundation.BorderStroke(2.dp,if(selected) Income else Pink),
        contentPadding=if(compact) PaddingValues(horizontal=4.dp,vertical=10.dp) else ButtonDefaults.ContentPadding,
        colors=ButtonDefaults.outlinedButtonColors(contentColor=if(selected) Income else Color.White)) {
        if(compact) Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(5.dp)) {
            Icon(if(selected) Icons.Default.CheckCircle else Icons.Default.TouchApp,null,tint=if(selected) Income else Pink,modifier=Modifier.size(18.dp))
            Text(label,fontSize=10.sp,lineHeight=13.sp,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
        } else {
        Icon(if(selected) Icons.Default.CheckCircle else Icons.Default.TouchApp,null,tint=if(selected) Income else Pink,modifier=Modifier.size(18.dp))
        Text(label,fontSize=13.sp,modifier=Modifier.padding(start=5.dp))
        }
    }
}

@Composable private fun GuideSuccess(text: String) {
    Panel {Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {Icon(Icons.Default.CheckCircle,null,tint=Income);Text(text,color=Income,fontWeight=FontWeight.SemiBold)}}
}
