package com.ridesharetaxpros.driver.ui

import android.net.Uri
import android.content.res.Configuration
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.core.Wire
import kotlinx.serialization.json.*

@Composable fun GettingStartedScreen(repo:DriverRepository,done:()->Unit,navigate:(String)->Unit,finishAvailable:Boolean=true) {
    var playing by remember {mutableStateOf<Double?>(null)}
    val manifest=remember {runCatching {Wire.parseToJsonElement(repo.app.assets.open("getting-started-chapters.json").bufferedReader().use {it.readText()}).jsonObject}.getOrDefault(JsonObject(emptyMap()))}
    val chapters=(manifest["chapters"] as? JsonArray) ?: JsonArray(emptyList())
    val duration=manifest["duration"]?.jsonPrimitive?.doubleOrNull?.takeIf {it.isFinite() && it>0}
    val local=remember {repo.app.resources.getIdentifier("getting_started","raw",repo.app.packageName)}
    val poster=remember {repo.app.resources.getIdentifier("getting_started_poster","drawable",repo.app.packageName)}
    val posterAspect=remember(poster) {if(poster!=0)android.graphics.BitmapFactory.Options().apply {inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeResource(repo.app.resources,poster,this)}.let {if(it.outWidth>0 && it.outHeight>0)it.outWidth.toFloat()/it.outHeight else 16f/9f} else 16f/9f}
    Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),contentAlignment=Alignment.TopCenter) {
    Column(Modifier.widthIn(max=650.dp).fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
    BrandHeader()
    Text("Let’s get you started",fontSize=32.sp,fontWeight=FontWeight.Bold)
    Text("A tour of your app, from your first driving record to finding an office. Watch now or come back from Get help.",color=Muted)
    if(poster!=0) Image(painterResource(poster),"Preview of the Gig Tax Pros getting-started video",Modifier.fillMaxWidth().aspectRatio(posterAspect).clip(RoundedCornerShape(20.dp)).clickable {playing=0.0})
    Panel(highlight=true) {
        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {Icon(Icons.Default.ScreenRotation,null,tint=Link);Text("Turn your phone sideways",fontWeight=FontWeight.SemiBold)}
        Text("Watch in landscape to see the app and captions more clearly. If the screen stays upright, turn on Auto-rotate in Quick Settings.",color=Muted)
    }
    Action("Watch the getting-started video",{playing=0.0})
    Text((duration?.let {"About ${kotlin.math.ceil(it/60).toInt()} minutes · "} ?: "")+"Narration and captions"+if(local!=0) " · Available offline" else "",fontSize=12.sp,color=Muted)
    if(chapters.isNotEmpty()) {
        Text("Jump to a topic",fontSize=22.sp,fontWeight=FontWeight.Bold)
        chapters.forEach {item->val chapter=item.jsonObject;var expanded by remember {mutableStateOf(false)}
            val start=chapter["start"]?.jsonPrimitive?.doubleOrNull ?: 0.0
            Panel {
                NavigationRow(chapter["title"]?.jsonPrimitive?.content ?: "Chapter",{playing=start},"${start.toInt()/60}:${(start.toInt()%60).toString().padStart(2,'0')}")
                TextButton(onClick={expanded=!expanded}) {Text("Read this part")}
                if(expanded) Text(chapter["narration"]?.jsonPrimitive?.content ?: "",color=Muted)
            }
        }
    }
    Action("Try the interactive screenshot guide",{navigate("Screenshot guide")},false)
    if(finishAvailable)Action("Start using the app",done)
    playing?.let {start->NativeTourPlayer(repo,if(local!=0)Uri.parse("android.resource://${repo.app.packageName}/$local") else Uri.parse("https://gigtax.pro/tour/getting-started.mp4"),start) {playing=null}}
    }
    }
}
