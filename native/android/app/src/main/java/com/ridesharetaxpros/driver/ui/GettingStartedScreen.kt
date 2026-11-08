package com.ridesharetaxpros.driver.ui

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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

@Composable fun GettingStartedScreen(repo:DriverRepository,done:()->Unit,navigate:(String)->Unit) {
    var playing by remember {mutableStateOf<Double?>(null)}
    val chapters=remember {runCatching {Wire.parseToJsonElement(repo.app.assets.open("getting-started-chapters.json").bufferedReader().use {it.readText()}).jsonObject["chapters"]!!.jsonArray}.getOrDefault(JsonArray(emptyList()))}
    val local=remember {repo.app.resources.getIdentifier("getting_started","raw",repo.app.packageName)}
    BrandHeader()
    Text("Let’s get you started",fontSize=32.sp,fontWeight=FontWeight.Bold)
    Text("A tour of your app, from your first driving record to finding an office. Watch now or come back from Get help.",color=Muted)
    Action("Watch the getting-started video",{playing=0.0})
    Text("Narration and captions"+if(local!=0) " · Available offline" else "",fontSize=12.sp,color=Muted)
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
    Action("Start using the app",done)
    playing?.let {start->
        Dialog(onDismissRequest={playing=null},properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)) {
            var player by remember {mutableStateOf<VideoView?>(null)}
            val lifecycle=LocalLifecycleOwner.current
            DisposableEffect(lifecycle) {
                val observer=LifecycleEventObserver {_,event->if(event==Lifecycle.Event.ON_PAUSE)player?.pause()}
                lifecycle.lifecycle.addObserver(observer)
                onDispose {lifecycle.lifecycle.removeObserver(observer);player?.stopPlayback();player=null}
            }
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                AndroidView(modifier=Modifier.fillMaxSize(),factory={context->VideoView(context).also {view->
                    player=view
                    view.setMediaController(MediaController(context).apply {setAnchorView(view)})
                    view.setVideoURI(if(local!=0)Uri.parse("android.resource://${repo.app.packageName}/$local") else Uri.parse("https://gigtax.pro/tour/getting-started.mp4"))
                    view.setOnPreparedListener {view.seekTo((start*1000).toInt());view.start()}
                    view.setOnErrorListener {_,_,_->repo.failure="The video could not load. The interactive screenshot guide remains available.";playing=null;true}
                }})
                IconButton(onClick={playing=null},modifier=Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {Icon(Icons.Default.Close,"Close video",tint=Color.White)}
            }
        }
    }
}
