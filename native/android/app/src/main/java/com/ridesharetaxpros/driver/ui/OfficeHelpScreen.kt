package com.ridesharetaxpros.driver.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.core.content.ContextCompat
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.data.boundedRead
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.Locale
import kotlinx.coroutines.*
import kotlin.math.*

private suspend fun officeBytes(url: String,limit: Int): ByteArray = withContext(Dispatchers.IO) {
    require(URI(url).scheme=="https")
    val connection=URI(url).toURL().openConnection() as HttpURLConnection
    try {
        connection.instanceFollowRedirects=false;connection.connectTimeout=15000;connection.readTimeout=20000
        connection.setRequestProperty("User-Agent","GigTaxPros/0.1 (+https://gigtax.pro)")
        if(connection.responseCode==404 && URI(url).path=="/api/offices") error("The office directory is being prepared. Please check again soon.")
        check(connection.responseCode==200) {"Could not load office details. Check your connection and try again."}
        connection.inputStream.use {boundedRead(it,limit)}
    } finally {connection.disconnect()}
}
private fun openOfficeLink(repo: DriverRepository,url: String) {
    runCatching {repo.app.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
        .onFailure {repo.failure="No app could open this link. Check your installed maps or browser apps."}
}
@Composable fun OfficeHelpScreen(repo: DriverRepository,navigate: (String)->Unit) {
    var directory by remember {mutableStateOf<OfficeDirectory?>(null)};var loading by remember {mutableStateOf(false)}
    var error by remember {mutableStateOf<String?>(null)};var locationError by remember {mutableStateOf<String?>(null)}
    var point by remember {mutableStateOf<OfficeCoordinate?>(null)};var area by remember {mutableStateOf<String?>(null)}
    var zip by remember {mutableStateOf("")};var locating by remember {mutableStateOf(false)};var searching by remember {mutableStateOf(false)}
    var selected by remember {mutableStateOf<String?>(null)};var updatedAt by remember {mutableStateOf<String?>(null)}
    var generation by remember {mutableIntStateOf(0)}
    val scope=rememberCoroutineScope()
    val manager=remember {repo.app.getSystemService(LocationManager::class.java)}
    var listener by remember {mutableStateOf<LocationListener?>(null)}
    fun stopLocation() {listener?.let {runCatching {manager.removeUpdates(it)}};listener=null;locating=false}
    fun locate() {
        generation++;val run=generation;stopLocation();locationError=null;locating=true
        val next=object:LocationListener {
            override fun onLocationChanged(location: Location) {
                if(run!=generation) return
                stopLocation()
                if(location.accuracy !in 0f..5000f || abs(System.currentTimeMillis()-location.time)>60_000) {locationError="A recent location is unavailable. Try your ZIP code instead.";return}
                point=OfficeCoordinate(location.latitude,location.longitude);area="your location";selected=null
            }
            override fun onProviderDisabled(provider: String) {if(run==generation) {stopLocation();locationError="Location is unavailable. Try your ZIP code instead."}}
        }
        listener=next
        try {
            val provider=when {
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)->LocationManager.NETWORK_PROVIDER
                ContextCompat.checkSelfPermission(repo.app,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)->LocationManager.GPS_PROVIDER
                else->error("Location is unavailable. Try your ZIP code instead.")
            }
            manager.getLastKnownLocation(provider)?.takeIf {abs(System.currentTimeMillis()-it.time)<=60_000 && it.accuracy in 0f..5000f}?.let {next.onLocationChanged(it)}
                ?: manager.requestLocationUpdates(provider,1000L,0f,next,Looper.getMainLooper())
            scope.launch {delay(20_000);if(run==generation && locating) {stopLocation();locationError="Could not find a recent location. Try your ZIP code instead."}}
        } catch(failure: Exception) {stopLocation();locationError=failure.message ?: "Location access is off. Enter a ZIP code, or allow location in Android Settings."}
    }
    val permissions=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {granted->
        if(granted[Manifest.permission.ACCESS_COARSE_LOCATION]==true || granted[Manifest.permission.ACCESS_FINE_LOCATION]==true) locate()
        else {stopLocation();locationError="Location access is off. Enter a ZIP code, or allow location in Android Settings."}
    }
    suspend fun refresh() {
        if(loading) return
        loading=true;error=null
        try {val result=Wire.decodeFromString<OfficeDirectory>(officeBytes("https://gigtax.pro/api/offices",2_000_000).toString(Charsets.UTF_8));result.ranked(null);directory=result;updatedAt=now()}
        catch(cancelled: CancellationException) {throw cancelled}
        catch(failure: Exception) {error=if(directory!=null) "Could not refresh. Showing the office details from your last update." else failure.message ?: "Could not load office details. Check your connection and try again."}
        finally {loading=false}
    }
    LaunchedEffect(Unit) {refresh()}
    val lifecycle=LocalLifecycleOwner.current
    DisposableEffect(lifecycle) {
        val observer=LifecycleEventObserver {_,event->if(event==Lifecycle.Event.ON_RESUME)scope.launch {refresh()}}
        lifecycle.lifecycle.addObserver(observer)
        onDispose {lifecycle.lifecycle.removeObserver(observer)}
    }
    DisposableEffect(Unit) {onDispose {generation++;stopLocation()}}
    Text("A local office. A real person.",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.Bold)
    Text("Find a Gig Tax Pros office, get help, or arrange an appointment.",color=Muted)
    TextButton(onClick={navigate("Getting started")},modifier=Modifier.testTag("help.tour")) {Text("▷ Watch the getting-started video")}
    directory?.support?.takeIf {it.callURL!=null || it.bookingURL!=null}?.let {support->Panel(if(support.shows24x7) "Help by phone · 24/7" else "Talk to Gig Tax Pros") {OfficeContactActions(repo,support)}}
    Button(enabled=!locating && !searching,onClick={permissions.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION))},modifier=Modifier.fillMaxWidth().testTag("help.locate")) {Text("Find offices near me")}
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(zip,{zip=it.filter {ch->ch.isDigit()}.take(5)},label={Text("ZIP code")},singleLine=true,modifier=Modifier.weight(1f).testTag("help.zip"))
        TextButton(enabled=!searching && !locating,onClick={
            val code=zip.trim()
            if(!code.matches(Regex("[0-9]{5}"))) {locationError="Enter a five-digit US ZIP code.";return@TextButton}
            generation++;val run=generation;stopLocation();searching=true;locationError=null
            scope.launch {
                try {
                    val places=withContext(Dispatchers.IO) {Geocoder(repo.app,Locale.US).getFromLocationName("$code, United States",5).orEmpty()}
                    if(run==generation) {
                        val place=places.firstOrNull {it.countryCode=="US" && it.postalCode?.startsWith(code)==true && it.hasLatitude() && it.hasLongitude()}
                        if(place==null) locationError="No location found for that ZIP code. Check it and try again."
                        else {point=OfficeCoordinate(place.latitude,place.longitude);area="ZIP $code";selected=null}
                    }
                } catch(cancelled: CancellationException) {throw cancelled}
                catch(_:Exception) {if(run==generation) locationError="ZIP search is unavailable. Try again or use your location."}
                finally {if(run==generation) searching=false}
            }
        },modifier=Modifier.testTag("help.search")) {Text("Search")}
    }
    if(locating || searching) LinearProgressIndicator(Modifier.fillMaxWidth(),color=Route)
    locationError?.let {Text(it,color=ExpenseColor,style=MaterialTheme.typography.bodySmall)}
    val offices=directory?.ranked(point).orEmpty()
    OfficeMap(repo,offices,point,selected) {selected=it}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
        Text(if(loading) "Updating office details…" else "Office directory",color=Muted,style=MaterialTheme.typography.labelLarge)
        TextButton(enabled=!loading,onClick={scope.launch {refresh()}},modifier=Modifier.testTag("help.refresh")) {Text("Refresh")}
    }
    error?.let {Text(it,color=ExpenseColor,style=MaterialTheme.typography.bodySmall,modifier=Modifier.testTag("help.directory.error"))}
    if(offices.isEmpty() && !loading) Panel("New offices are joining the network") {Text("Confirmed locations, contact numbers and appointment options will appear here as offices join. Refresh to check for updates.",color=Muted)}
    else area?.let {Text("Offices nearest $it · Straight-line miles",color=Muted,style=MaterialTheme.typography.bodySmall)}
    for(office in offices.sortedBy {if(it.id==selected) 0 else 1}) Panel(office.name) {
        if(office.id==selected) Text("Selected office",color=Route,style=MaterialTheme.typography.labelMedium)
        Text(office.fullAddress)
        OfficeExterior(repo,office)
        point?.let {Text("${"%.1f".format(Locale.US,it.milesTo(office.coordinate))} miles away · straight-line",color=Muted,style=MaterialTheme.typography.bodySmall)}
        if(office.contact.shows24x7) Text("Phone help available 24/7",color=Income)
        OfficeContactActions(repo,office.contact)
        OutlinedButton(onClick={openOfficeLink(repo,"https://www.google.com/maps/dir/?api=1&destination=${office.latitude},${office.longitude}&travelmode=driving")},modifier=Modifier.fillMaxWidth()) {Text("Get directions")}
    }
    updatedAt?.let {Text("Updated ${profileDay(it)}",color=Muted,style=MaterialTheme.typography.labelSmall)}
    TextButton(onClick={openOfficeLink(repo,"https://gigtax.pro")}) {Text("Visit GigTax.pro")}
    Text("Distance sorting happens on your phone. Map services receive the map areas, ZIP searches and directions you request. Map tiles are cached on this phone; your search location is not saved to tax records.",color=Muted,style=MaterialTheme.typography.bodySmall)
}
@Composable private fun OfficeContactActions(repo: DriverRepository,contact: OfficeContact) {
    if(contact.hours.isNotBlank()) Text(contact.hours,color=Muted)
    contact.callURL?.let {url->TextButton(onClick={openOfficeLink(repo,url)}) {Text("Call ${contact.phone}")}}
    val booking=contact.bookingURL
    if(booking!=null) TextButton(onClick={openOfficeLink(repo,booking)}) {Text("Book an appointment")}
    else if(contact.callURL!=null) Text("Call to arrange an appointment.",color=Muted,style=MaterialTheme.typography.bodySmall)
}
private fun decodeOfficeImage(bytes: ByteArray): ImageBitmap? {
    val options=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
    if(options.outWidth<=0 || options.outHeight<=0 || options.outWidth.toLong()*options.outHeight>100_000_000) return null
    var scale=1;while(max(options.outWidth,options.outHeight)/scale>1600) scale*=2
    return BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply {inSampleSize=scale})?.asImageBitmap()
}
@Composable private fun OfficeExterior(repo: DriverRepository,office: DirectoryOffice) {
    var image by remember(office.id,office.exteriorImageURL) {mutableStateOf<ImageBitmap?>(null)}
    var fetching by remember {mutableStateOf(false)}
    LaunchedEffect(office.exteriorImageURL) {
        val url=office.exteriorImageURL?.let(::publicOfficeURL) ?: return@LaunchedEffect
        fetching=true
        try {image=withContext(Dispatchers.IO) {decodeOfficeImage(officeBytes(url,4*1024*1024))}}
        catch(cancelled: CancellationException) {throw cancelled}
        catch(_:Exception) {image=null}
        finally {fetching=false}
    }
    image?.let {Image(it,"Exterior of ${office.name}",Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(16.dp)))}
        ?: Text(if(fetching) "Loading office exterior…" else "Office exterior photo not available.",color=Muted,style=MaterialTheme.typography.bodySmall)
    TextButton(onClick={
        val street=Intent(Intent.ACTION_VIEW,Uri.parse("google.streetview:cbll=${office.latitude},${office.longitude}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching {repo.app.startActivity(street)}.onFailure {openOfficeLink(repo,"https://www.google.com/maps/search/?api=1&query=${office.latitude},${office.longitude}")}
    }) {Text("View street surroundings")}
}

private data class OfficeTile(val z: Int,val x: Int,val y: Int,val rawX: Int)
private fun mapX(lon: Double,z: Int)=(lon+180)/360*(1 shl z)*256
private fun mapY(lat: Double,z: Int): Double {val phi=lat.coerceIn(-85.0,85.0)*PI/180;return (1-ln(tan(phi)+1/cos(phi))/PI)/2*(1 shl z)*256}
private fun inverseMap(x: Double,y: Double,z: Int): OfficeCoordinate {val size=(1 shl z)*256.0;return OfficeCoordinate(atan(sinh(PI*(1-2*y/size)))*180/PI,(x/size*360-180).let {((it+540)%360)-180})}
/** Actual geographic tiles and office coordinates, with no SDK key or browser surface. */
@Composable private fun OfficeMap(repo: DriverRepository,offices: List<DirectoryOffice>,point: OfficeCoordinate?,selected: String?,select: (String)->Unit) {
    val density=LocalDensity.current.density
    var size by remember {mutableStateOf(IntSize(0,0))};var zoom by remember {mutableIntStateOf(3)}
    var center by remember {mutableStateOf(OfficeCoordinate(39.8,-98.6))}
    val images=remember {mutableStateMapOf<String,ImageBitmap>()}
    var loading by remember {mutableStateOf(false)};var failed by remember {mutableStateOf(false)}
    LaunchedEffect(point,offices.map {Triple(it.id,it.latitude,it.longitude)},size) {
        if(size.width>0 && size.height>0) {
            val nearest=if(point!=null)offices.take(3) else offices
            val points=nearest.map {PositionPoint(it.latitude,it.longitude)}+listOfNotNull(point?.let {PositionPoint(it.latitude,it.longitude)})
            if(points.isNotEmpty()) {
                val fitted=RoadMapProjection.fit(points,size.width/density.toDouble(),size.height/density.toDouble())
                center=OfficeCoordinate(fitted.center.latitude,fitted.center.longitude);zoom=floor(fitted.zoom).toInt()
            }
        }
    }
    val worldX=mapX(center.longitude,zoom);val worldY=mapY(center.latitude,zoom)
    val width=size.width/density;val height=size.height/density
    val firstX=floor((worldX-width/2)/256).toInt();val firstY=floor((worldY-height/2)/256).toInt();val count=1 shl zoom
    val tiles=(firstX..floor((worldX+width/2)/256).toInt()).flatMap {x->(firstY..floor((worldY+height/2)/256).toInt()).filter {it in 0 until count}.map {y->OfficeTile(zoom,((x%count)+count)%count,y,x)}}
    val keys=tiles.map {"${it.z}_${it.x}_${it.y}"}
    LaunchedEffect(keys,size) {
        if(size.width==0) return@LaunchedEffect
        loading=true;failed=false
        try {
            // Only tiles currently visible in this human-facing map are requested.
            for(tile in tiles) {
                ensureActive()
                val key="${tile.z}_${tile.x}_${tile.y}"
                if(key in images) continue
                val bitmap=withContext(Dispatchers.IO) {
                    val cache=File(repo.app.cacheDir,"office-map-tiles").apply {mkdirs()};val file=File(cache,"$key.png")
                    val raw=if(file.isFile && System.currentTimeMillis()-file.lastModified()<7L*24*3600*1000) file.readBytes()
                    else officeBytes("https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png",1024*1024).also {file.writeBytes(it)}
                    decodeOfficeImage(raw)
                }
                if(bitmap!=null) images[key]=bitmap else failed=true
            }
        } catch(cancelled: CancellationException) {throw cancelled}
        catch(_:Exception) {failed=true}
        finally {loading=false}
        val used=keys.toSet();images.keys.filter {it !in used}.toList().forEach {images.remove(it)}
    }
    Box(Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF15212B)).onSizeChanged {size=it}.testTag("help.map")) {
        Canvas(Modifier.fillMaxSize().semantics {
            contentDescription="Office map. ${offices.size} confirmed locations. Use zoom controls and drag to explore."
            customActions=offices.take(20).map {office->CustomAccessibilityAction("Select ${office.name}") {select(office.id);true}}
        }.pointerInput(zoom,center) {detectDragGestures {change,drag->change.consume();center=inverseMap(mapX(center.longitude,zoom)-drag.x/density,mapY(center.latitude,zoom)-drag.y/density,zoom)}}
            .pointerInput(offices,zoom,center,size) {detectTapGestures {tap->offices.minByOrNull {office->val x=((mapX(office.longitude,zoom)-worldX)+width/2)*density;val y=((mapY(office.latitude,zoom)-worldY)+height/2)*density;hypot(x-tap.x,y-tap.y)}?.let {office->
                val x=((mapX(office.longitude,zoom)-worldX)+width/2)*density;val y=((mapY(office.latitude,zoom)-worldY)+height/2)*density
                if(hypot(x-tap.x,y-tap.y)<28*density) select(office.id)
            }}}) {
            for(tile in tiles) images["${tile.z}_${tile.x}_${tile.y}"]?.let {bitmap->
                drawImage(bitmap,dstOffset=IntOffset((((tile.rawX*256-worldX)+width/2)*density).roundToInt(),(((tile.y*256-worldY)+height/2)*density).roundToInt()),dstSize=IntSize((256*density).roundToInt(),(256*density).roundToInt()))
            }
            for(office in offices) {
                val at=Offset((((mapX(office.longitude,zoom)-worldX)+width/2)*density).toFloat(),(((mapY(office.latitude,zoom)-worldY)+height/2)*density).toFloat())
                drawCircle(Color.White,radius=(if(office.id==selected) 11 else 8)*density,center=at);drawCircle(Pink,radius=(if(office.id==selected) 8 else 5)*density,center=at)
            }
            point?.let {p->val at=Offset((((mapX(p.longitude,zoom)-worldX)+width/2)*density).toFloat(),(((mapY(p.latitude,zoom)-worldY)+height/2)*density).toFloat());drawCircle(Color.White,9*density,at);drawCircle(Route,6*density,at)}
        }
        Column(Modifier.align(Alignment.TopEnd).padding(10.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            FilledTonalButton(enabled=zoom<17,onClick={zoom++},contentPadding=PaddingValues(0.dp),modifier=Modifier.size(40.dp)) {Text("+",style=MaterialTheme.typography.titleLarge)}
            FilledTonalButton(enabled=zoom>2,onClick={zoom--},contentPadding=PaddingValues(0.dp),modifier=Modifier.size(40.dp)) {Text("−",style=MaterialTheme.typography.titleLarge)}
        }
        TextButton(onClick={openOfficeLink(repo,"https://www.openstreetmap.org/copyright")},modifier=Modifier.align(Alignment.BottomEnd).background(Color(0xDD080B12)),contentPadding=PaddingValues(6.dp)) {Text("© OpenStreetMap contributors",style=MaterialTheme.typography.labelSmall,color=Color.White)}
        if(loading) CircularProgressIndicator(Modifier.align(Alignment.TopStart).padding(12.dp).size(20.dp),color=Pink,strokeWidth=2.dp)
        if(failed) Text("Map unavailable · Check your connection",Modifier.align(Alignment.Center).background(Ink).padding(10.dp),color=Color.White,style=MaterialTheme.typography.labelMedium)
    }
}
