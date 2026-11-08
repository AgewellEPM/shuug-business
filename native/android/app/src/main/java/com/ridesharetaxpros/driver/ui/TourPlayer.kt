package com.ridesharetaxpros.driver.ui

import android.content.res.Configuration
import android.media.MediaPlayer
import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.data.boundedRead
import com.ridesharetaxpros.driver.core.parseTourCaptions
import com.ridesharetaxpros.driver.core.atPosition
import java.net.HttpURLConnection
import java.net.URI
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay

/** Native app-display playback; English soft captions start selected. */
@Composable fun NativeTourPlayer(repo:DriverRepository,uri:Uri,start:Double,close:()->Unit) {
    var player by remember {mutableStateOf<VideoView?>(null)}
    var media by remember {mutableStateOf<MediaPlayer?>(null)}
    var captionsEnabled by remember {mutableStateOf(true)}
    var captionsAvailable by remember {mutableStateOf(false)}
    var selectedCaption by remember {mutableIntStateOf(-1)}
    var subtitles by remember {mutableStateOf<ByteArray?>(null)}
    var positionMs by remember {mutableLongStateOf(0)}
    val cues=remember(subtitles) {subtitles?.let {runCatching {parseTourCaptions(it)}.getOrDefault(emptyList())} ?: emptyList()}
    val lifecycle=LocalLifecycleOwner.current
    fun selectEnglish(target:MediaPlayer) {
        runCatching {
            val tracks=target.trackInfo.mapIndexedNotNull {index,track->
                if(track.trackType==MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_SUBTITLE || track.trackType==MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT)index to track else null
            }
            captionsAvailable=tracks.isNotEmpty() || cues.isNotEmpty()
            if(cues.isNotEmpty()) {
                // OEM VideoView implementations can select an English track while
                // hiding its renderer. Render our selectable soft cues consistently,
                // and prevent a second system subtitle renderer from duplicating them.
                tracks.forEach {(index,_)->runCatching {target.deselectTrack(index)}}
                selectedCaption=-1
            } else if(captionsEnabled) {
                val index=(tracks.lastOrNull {it.second.language.lowercase() in setOf("en","eng","en-us","en-gb")} ?: tracks.lastOrNull())?.first
                if(index!=null) {target.selectTrack(index);selectedCaption=index}
            } else if(selectedCaption>=0) {target.deselectTrack(selectedCaption);selectedCaption=-1}
        }
    }
    LaunchedEffect(Unit) {
        subtitles=withContext(Dispatchers.IO) {
            val raw=repo.app.resources.getIdentifier("getting_started_captions","raw",repo.app.packageName)
            if(raw!=0) repo.app.resources.openRawResource(raw).use {boundedRead(it,1024*1024)}
            else try {
                val connection=URI("https://gigtax.pro/tour/getting-started.en.srt").toURL().openConnection() as HttpURLConnection
                try {
                    connection.instanceFollowRedirects=false;connection.connectTimeout=15000;connection.readTimeout=20000
                    if(connection.responseCode==200)connection.inputStream.use {boundedRead(it,1024*1024)} else null
                } finally {connection.disconnect()}
            } catch(error:CancellationException) {throw error}catch(_:Exception) {null}
        }
    }
    LaunchedEffect(cues,player) {
        if(cues.isNotEmpty()) captionsAvailable=true
        media?.let(::selectEnglish)
    }
    LaunchedEffect(player) {while(true) {positionMs=runCatching {player?.currentPosition?.toLong() ?: 0L}.getOrDefault(0L);delay(80)}}
    LaunchedEffect(captionsEnabled,media) {media?.let(::selectEnglish)}
    DisposableEffect(lifecycle) {
        val observer=LifecycleEventObserver {_,event->if(event==Lifecycle.Event.ON_PAUSE)player?.pause()}
        lifecycle.lifecycle.addObserver(observer)
        onDispose {lifecycle.lifecycle.removeObserver(observer);player?.stopPlayback()}
    }
    Dialog(onDismissRequest=close,properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)) {
        val view=LocalView.current
        DisposableEffect(view) {
            val window=(view.parent as? DialogWindowProvider)?.window
            window?.let {WindowCompat.getInsetsController(it,view).hide(WindowInsetsCompat.Type.systemBars())}
            onDispose {}
        }
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(modifier=Modifier.fillMaxSize(),factory={context->VideoView(context).also {view->
                player=view
                view.setMediaController(MediaController(context).apply {setAnchorView(view)})
                view.setOnPreparedListener {prepared->media=prepared;selectEnglish(prepared);prepared.seekTo((start.coerceIn(0.0,86400.0)*1000).toLong(),MediaPlayer.SEEK_CLOSEST);view.start()}
                view.setOnInfoListener {prepared,what,_->if(what==MediaPlayer.MEDIA_INFO_METADATA_UPDATE)selectEnglish(prepared);false}
                view.setOnErrorListener {_,_,_->repo.failure="The video could not load. The interactive screenshot guide remains available.";close();true}
                view.setVideoURI(uri)
            }})
            if(captionsEnabled) cues.atPosition(positionMs)?.let {caption->
                Text(caption,Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal=28.dp,vertical=20.dp)
                    .widthIn(max=900.dp).background(Color.Black.copy(alpha=.84f),RoundedCornerShape(6.dp)).padding(horizontal=14.dp,vertical=8.dp),
                    color=Color.White,fontSize=18.sp,lineHeight=24.sp,textAlign=TextAlign.Center)
            }
            if(LocalConfiguration.current.orientation!=Configuration.ORIENTATION_LANDSCAPE) {
                Text("Turn your phone sideways",Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top=12.dp).background(Color.Black.copy(alpha=.85f),RoundedCornerShape(12.dp)).padding(horizontal=16.dp,vertical=12.dp),color=Color.White,fontWeight=FontWeight.SemiBold)
            }
            IconToggleButton(checked=captionsEnabled,onCheckedChange={captionsEnabled=it},enabled=captionsAvailable,modifier=Modifier.align(Alignment.TopStart).statusBarsPadding().padding(8.dp)) {
                Icon(Icons.Default.ClosedCaption,if(captionsEnabled) "English captions on" else "English captions off",tint=if(captionsEnabled)Color.White else Color.Gray)
            }
            IconButton(onClick=close,modifier=Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {Icon(Icons.Default.Close,"Close video",tint=Color.White)}
        }
    }
}
