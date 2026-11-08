package com.ridesharetaxpros.driver.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.AtomicFile
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.Properties
import kotlin.math.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Geography comes from real street tiles; overlays use the actual saved/returned coordinates. */
data class RoadMapLine(val points: List<PositionPoint>,val tint: Color,val label: String,val provider: RoadProvider=RoadProvider.LOCAL)
data class RoadMapMarker(val point: PositionPoint,val tint: Color,val label: String)

private object StreetTiles {
    private val lock=Mutex()
    private const val week=7L*24*3600*1000
    suspend fun load(repo: DriverRepository,tile: RoadMapTile): ImageBitmap = withContext(Dispatchers.IO) {
        lock.withLock {
            val directory=File(repo.app.cacheDir,"road-map-tiles").apply {mkdirs()}
            val file=File(directory,"${tile.key}.png");val metadata=File(directory,"${tile.key}.properties")
            val state=Properties().apply {if(metadata.isFile) runCatching {metadata.inputStream().use(::load)}}
            val expiry=state.getProperty("expiresAt")?.toLongOrNull() ?: (file.lastModified()+week)
            fun decode(bytes: ByteArray): ImageBitmap {
                val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                require(bounds.outWidth in 1..512 && bounds.outHeight in 1..512) {"Street map image is unavailable."}
                return (BitmapFactory.decodeByteArray(bytes,0,bytes.size) ?: error("Street map image is unavailable.")).asImageBitmap()
            }
            if(file.isFile && System.currentTimeMillis()<expiry) return@withLock decode(file.readBytes())
            // Retain recent tiles, and remove only expired cache files when the cache grows.
            val files=directory.listFiles().orEmpty().filter {it.extension=="png"}
            var bytes=files.sumOf {it.length()}
            if(bytes>64L*1024*1024) for(old in files.filter {System.currentTimeMillis()-it.lastModified()>week}.sortedBy {it.lastModified()}) {
                if(bytes<=64L*1024*1024) break
                bytes-=old.length();old.delete();File(directory,old.nameWithoutExtension+".properties").delete()
            }
            require(file.isFile || (bytes<96L*1024*1024 && directory.usableSpace>32L*1024*1024)) {"Street map cache is full. Route lines remain available."}
            val connection=URI("https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png").toURL().openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects=false;connection.connectTimeout=10000;connection.readTimeout=15000
                connection.setRequestProperty("User-Agent","GigTaxPros-Android/0.1 (+https://gigtax.pro)")
                connection.setRequestProperty("Accept","image/png")
                if(file.isFile) {state.getProperty("etag")?.let {connection.setRequestProperty("If-None-Match",it)}
                    state.getProperty("lastModified")?.let {connection.setRequestProperty("If-Modified-Since",it)}}
                val response=connection.responseCode
                require(response==200 || (response==304 && file.isFile)) {"Street map is unavailable. Check your connection."}
                val raw=if(response==304) file.readBytes() else connection.inputStream.use {boundedRead(it,1024*1024)}
                val image=decode(raw)
                if(response==200) {val atomic=AtomicFile(file);val output=atomic.startWrite();try {output.write(raw);atomic.finishWrite(output)} catch(problem: Exception) {atomic.failWrite(output);throw problem}}
                connection.getHeaderField("ETag")?.let {state.setProperty("etag",it)}
                connection.getHeaderField("Last-Modified")?.let {state.setProperty("lastModified",it)}
                val maxAge=Regex("(?:^|,)\\s*max-age=(\\d+)").find(connection.getHeaderField("Cache-Control").orEmpty())?.groupValues?.get(1)?.toLongOrNull()?.coerceAtMost(365L*24*3600)?.times(1000)
                // At least seven days when explicit HTTP freshness cannot be used.
                val ttl=maxAge ?: (connection.expiration-System.currentTimeMillis()).takeIf {it>0} ?: week
                state.setProperty("expiresAt",(System.currentTimeMillis()+ttl).toString())
                metadata.outputStream().use {state.store(it,null)}
                file.setLastModified(System.currentTimeMillis())
                image
            } catch(cancelled: CancellationException) {throw cancelled}
            catch(problem: Exception) {if(file.isFile) decode(file.readBytes()) else throw problem}
            finally {connection.disconnect()}
        }
    }
}

@Composable fun SharedRoadMap(repo: DriverRepository,lines: List<RoadMapLine>,markers: List<RoadMapMarker> = emptyList(),
    height: Dp=240.dp,description: String="Road map") {
    val sources=lines.map {it.provider}.filter {it!=RoadProvider.LOCAL}.toSet()
    if(sources.size>1) {Panel("Recalculate this route") {Text("The road provider changed. Recalculate before displaying this comparison.",color=Caution)};return}
    // Recorded GPS previews remain available without a paid routing setup.
    // Only returned provider geometry controls the comparison renderer.
    val provider=sources.singleOrNull() ?: RoadProvider.LOCAL
    when(provider) {
        RoadProvider.GOOGLE->GoogleRoadMap(lines,markers,height,description)
        RoadProvider.OSRM,RoadProvider.LOCAL->OpenStreetRoadMap(repo,lines,markers,height,description)
    }
}

@Composable private fun OpenStreetRoadMap(repo: DriverRepository,lines: List<RoadMapLine>,markers: List<RoadMapMarker>,
    height: Dp,description: String) {
    val density=LocalDensity.current.density
    val points=lines.flatMap {it.points}.filter {it.valid}+markers.map {it.point}.filter {it.valid}
    if(points.isEmpty()) return
    val geometryKey=points.hashCode()
    var size by remember {mutableStateOf(IntSize.Zero)}
    var viewport by remember(geometryKey) {mutableStateOf(RoadMapProjection.fit(points,360.0,height.value.toDouble()))}
    val images=remember {mutableStateMapOf<String,ImageBitmap>()}
    var failed by remember {mutableStateOf(false)}
    var loading by remember {mutableStateOf(false)}
    var retry by remember {mutableIntStateOf(0)}
    var fetchId by remember {mutableIntStateOf(0)}
    val width=size.width/density.toDouble();val logicalHeight=size.height/density.toDouble()
    fun fit() {viewport=RoadMapProjection.fit(points,width,logicalHeight)}
    LaunchedEffect(geometryKey,size) {if(size.width>0) fit()}
    val tiles=RoadMapProjection.visible(viewport,width,logicalHeight)
    val keys=tiles.map {it.key}.distinct()
    LaunchedEffect(keys,retry) {
        val request=++fetchId
        if(size.width<=0) return@LaunchedEffect
        // Debounce direct manipulation; never preload other zoom levels or areas.
        delay(140);loading=true;failed=false
        try {for(tile in tiles.distinctBy {it.key}) {
            ensureActive();if(tile.key in images) continue
            try {images[tile.key]=StreetTiles.load(repo,tile)} catch(cancelled: CancellationException) {throw cancelled} catch(_: Exception) {failed=true}
        }} finally {if(request==fetchId) {loading=false;images.keys.filter {it !in keys}.toList().forEach {images.remove(it)}}}
    }
    // Neutral dark presentation keeps original street labels readable under bright routes.
    val darkness=remember {ColorFilter.colorMatrix(ColorMatrix(floatArrayOf(
        -.1658f,-.558f,-.0562f,0f,211f,
        -.1658f,-.558f,-.0562f,0f,215f,
        -.1658f,-.558f,-.0562f,0f,221f,
        0f,0f,0f,1f,0f)))}
    Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(18.dp)).background(Color(0xFF131B25))
        .onSizeChanged {size=it}.testTag("road.map")) {
        Canvas(Modifier.fillMaxSize().semantics {contentDescription="$description. ${markers.joinToString {it.label}}. Drag or pinch to explore, or use zoom and fit controls."}
            .pointerInput(geometryKey,size) {detectTransformGestures {_,pan,zoom,_ ->
                val span=256*2.0.pow(viewport.zoom)
                val center=RoadMapProjection.coordinate(RoadMapProjection.x(viewport.center.longitude)-pan.x/density/span,
                    RoadMapProjection.y(viewport.center.latitude)-pan.y/density/span)
                viewport=RoadMapViewport(center,(viewport.zoom+log2(zoom.toDouble())).coerceIn(2.0,18.0))
            }}) {
            val z=floor(viewport.zoom).toInt();val count=1 shl z;val scale=2.0.pow(viewport.zoom-z)*density
            val cx=RoadMapProjection.x(viewport.center.longitude)*count*256;val cy=RoadMapProjection.y(viewport.center.latitude)*count*256
            fun at(p: PositionPoint): Offset {val dx=RoadMapProjection.wrappedDelta(RoadMapProjection.x(p.longitude),RoadMapProjection.x(viewport.center.longitude))*count*256
                return Offset((size.width/2+dx*scale).toFloat(),(size.height/2+(RoadMapProjection.y(p.latitude)*count*256-cy)*scale).toFloat())}
            for(tile in tiles) images[tile.key]?.let {bitmap->drawImage(bitmap,
                dstOffset=IntOffset((size.width/2+(tile.unwrappedX*256-cx)*scale).roundToInt(),(size.height/2+(tile.y*256-cy)*scale).roundToInt()),
                dstSize=IntSize((256*scale).roundToInt()+1,(256*scale).roundToInt()+1),colorFilter=darkness)}
            for(line in lines) {val path=Path();var previous=false
                line.points.forEach {p->if(p.valid) {val point=at(p);if(previous) path.lineTo(point.x,point.y) else path.moveTo(point.x,point.y);previous=true} else previous=false}
                drawPath(path,Color.Black.copy(alpha=.45f),style=Stroke(7.dp.toPx(),cap=StrokeCap.Round,join=StrokeJoin.Round))
                drawPath(path,line.tint,style=Stroke(4.dp.toPx(),cap=StrokeCap.Round,join=StrokeJoin.Round))}
            for(marker in markers.filter {it.point.valid}) {val point=at(marker.point);drawCircle(Color.White,7.dp.toPx(),point);drawCircle(marker.tint,5.dp.toPx(),point)}
        }
        Row(Modifier.align(Alignment.TopStart).padding(8.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            FilledTonalButton(onClick={fit()},contentPadding=PaddingValues(horizontal=10.dp,vertical=0.dp),modifier=Modifier.height(38.dp)) {Text("Fit route")}
            if(loading) CircularProgressIndicator(Modifier.padding(8.dp).size(20.dp),color=Pink,strokeWidth=2.dp)
        }
        Column(Modifier.align(Alignment.TopEnd).padding(8.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            FilledTonalButton(onClick={viewport=viewport.copy(zoom=(viewport.zoom+1).coerceAtMost(18.0))},enabled=viewport.zoom<18,
                contentPadding=PaddingValues(0.dp),modifier=Modifier.size(38.dp)) {Text("+",style=MaterialTheme.typography.titleLarge)}
            FilledTonalButton(onClick={viewport=viewport.copy(zoom=(viewport.zoom-1).coerceAtLeast(2.0))},enabled=viewport.zoom>2,
                contentPadding=PaddingValues(0.dp),modifier=Modifier.size(38.dp)) {Text("−",style=MaterialTheme.typography.titleLarge)}
        }
        if(failed) TextButton(onClick={retry++},modifier=Modifier.align(Alignment.BottomStart).padding(bottom=30.dp).background(Ink),contentPadding=PaddingValues(6.dp)) {Text("Streets unavailable · Retry",style=MaterialTheme.typography.labelSmall,color=Caution)}
        TextButton(onClick={runCatching {repo.app.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://www.openstreetmap.org/copyright")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}},
            modifier=Modifier.align(Alignment.BottomEnd).background(Color(0xEE080B12)),contentPadding=PaddingValues(6.dp)) {Text("© OpenStreetMap contributors",style=MaterialTheme.typography.labelSmall,color=Color.White)}
    }
}
