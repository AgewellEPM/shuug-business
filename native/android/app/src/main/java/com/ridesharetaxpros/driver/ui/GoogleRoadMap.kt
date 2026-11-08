package com.ridesharetaxpros.driver.ui

import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.content.Context
import android.view.MotionEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.maps.*
import com.google.android.gms.maps.model.*
import com.ridesharetaxpros.driver.core.RoadProvider
import com.ridesharetaxpros.driver.data.googleMapUnavailableReason
import kotlinx.coroutines.delay

private class EmbeddedGoogleMap(context: Context,options: GoogleMapOptions): MapView(context,options) {
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(event.actionMasked!=MotionEvent.ACTION_UP && event.actionMasked!=MotionEvent.ACTION_CANCEL)
        return super.dispatchTouchEvent(event)
    }
}

/** Native Maps SDK view; Google's built-in logo/attribution remain visible. */
@Composable internal fun GoogleRoadMap(lines: List<RoadMapLine>,markers: List<RoadMapMarker>,height: Dp,description: String) {
    val context=LocalContext.current;val lifecycle=LocalLifecycleOwner.current.lifecycle;val density=LocalDensity.current.density
    val unavailable=googleMapUnavailableReason(context)
    if(unavailable!=null) {Panel("Google Maps") {Text(unavailable,color=Muted,fontSize=13.sp)};return}
    if(lines.any {it.provider==RoadProvider.OSRM}) {Panel("Recalculate this route") {Text("The road provider changed. Recalculate before displaying this comparison.",color=Caution)};return}
    val points=remember(lines,markers) {lines.flatMap {it.points}.filter {it.valid}+markers.map {it.point}.filter {it.valid}}
    if(points.isEmpty()) return
    var attempt by remember {mutableIntStateOf(0)}
    val view=remember(context,attempt) {runCatching {
        MapsInitializer.initialize(context,MapsInitializer.Renderer.LATEST) {}
        EmbeddedGoogleMap(context,GoogleMapOptions().mapType(GoogleMap.MAP_TYPE_NORMAL).zoomControlsEnabled(false).mapToolbarEnabled(false)
            .camera(CameraPosition.fromLatLngZoom(LatLng(points.first().latitude,points.first().longitude),13f))).apply {onCreate(null)}
    }.getOrNull()}
    if(view==null) {Panel("Google Maps") {Text("Google Maps could not initialize on this device. Directions in Google Maps is still available.",color=Caution)};return}
    var map by remember(view) {mutableStateOf<GoogleMap?>(null)}
    var active by remember(view) {mutableStateOf(true)}
    var loaded by remember(view) {mutableStateOf(false)}
    var failed by remember(view) {mutableStateOf(false)}
    var fitted by remember(view) {mutableStateOf(false)}
    fun fit() {val target=map ?: return;if(view.width<=0 || view.height<=0) return
        val bounds=LatLngBounds.builder();points.forEach {bounds.include(LatLng(it.latitude,it.longitude))}
        runCatching {target.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(),(32*density).toInt()));fitted=true}.onFailure {failed=true}
    }
    DisposableEffect(view,lifecycle) {
        var started=false;var resumed=false;var destroyed=false
        fun start() {if(!destroyed && !started) {view.onStart();started=true}}
        fun resume() {start();if(!destroyed && !resumed) {view.onResume();resumed=true}}
        fun pause() {if(resumed) {view.onPause();resumed=false}}
        fun stop() {pause();if(started) {view.onStop();started=false}}
        fun destroy() {if(!destroyed) {stop();view.onDestroy();destroyed=true;active=false}}
        val observer=LifecycleEventObserver {_,event->when(event) {
            Lifecycle.Event.ON_START->start();Lifecycle.Event.ON_RESUME->resume();Lifecycle.Event.ON_PAUSE->pause()
            Lifecycle.Event.ON_STOP->stop();Lifecycle.Event.ON_DESTROY->destroy();else->Unit
        }}
        lifecycle.addObserver(observer)
        if(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) resume() else if(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) start()
        val memory=object: ComponentCallbacks {
            override fun onConfigurationChanged(configuration: Configuration) {}
            override fun onLowMemory() {if(!destroyed) view.onLowMemory()}
        }
        context.applicationContext.registerComponentCallbacks(memory)
        view.getMapAsync {if(active) map=it}
        onDispose {lifecycle.removeObserver(observer);context.applicationContext.unregisterComponentCallbacks(memory);destroy()}
    }
    LaunchedEffect(map,lines,markers) {
        val target=map ?: return@LaunchedEffect
        try {
        fitted=false
        target.uiSettings.isMapToolbarEnabled=false;target.uiSettings.isZoomControlsEnabled=false
        target.setPadding((8*density).toInt(),0,(8*density).toInt(),(8*density).toInt())
        target.isTrafficEnabled=false;target.clear()
        target.setMapStyle(MapStyleOptions("""[{"elementType":"geometry","stylers":[{"color":"#17212d"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#d5d1df"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#17212d"}]},{"featureType":"poi","stylers":[{"visibility":"off"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#344357"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#0b1728"}]}]"""))
        lines.forEach {line->
            var segment=mutableListOf<LatLng>()
            fun draw() {if(segment.size>=2) target.addPolyline(PolylineOptions().addAll(segment).color(line.tint.toArgb()).width(4*density).geodesic(false));segment=mutableListOf()}
            line.points.forEach {point->if(point.valid) segment+=LatLng(point.latitude,point.longitude) else draw()};draw()
        }
        markers.filter {it.point.valid}.forEach {marker->
            val hsv=FloatArray(3);android.graphics.Color.colorToHSV(marker.tint.toArgb(),hsv)
            target.addMarker(MarkerOptions().position(LatLng(marker.point.latitude,marker.point.longitude)).title(marker.label).icon(BitmapDescriptorFactory.defaultMarker(hsv[0])))
        }
        target.setOnMapLoadedCallback {if(active) {loaded=true;failed=false;if(!fitted) fit()}}
        if(loaded && !fitted) fit()
        } catch(problem: Exception) {failed=true}
    }
    LaunchedEffect(view) {delay(20000);if(active && !loaded) failed=true}
    Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(18.dp)).background(Color(0xFF17212D)).testTag("road.google.map")) {
        AndroidView(factory={view},modifier=Modifier.fillMaxSize(),update={it.contentDescription=description})
        Row(Modifier.align(Alignment.TopStart).padding(8.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            FilledTonalButton(onClick={fit()},enabled=map!=null,contentPadding=PaddingValues(horizontal=10.dp,vertical=0.dp),modifier=Modifier.height(38.dp)) {Text("Fit route")}
            if(!loaded && !failed) CircularProgressIndicator(Modifier.padding(8.dp).size(20.dp),color=Pink,strokeWidth=2.dp)
        }
        Column(Modifier.align(Alignment.TopEnd).padding(8.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            FilledTonalButton(onClick={map?.animateCamera(CameraUpdateFactory.zoomIn())},enabled=map!=null,contentPadding=PaddingValues(0.dp),modifier=Modifier.size(38.dp)) {Text("+",style=MaterialTheme.typography.titleLarge)}
            FilledTonalButton(onClick={map?.animateCamera(CameraUpdateFactory.zoomOut())},enabled=map!=null,contentPadding=PaddingValues(0.dp),modifier=Modifier.size(38.dp)) {Text("−",style=MaterialTheme.typography.titleLarge)}
        }
        if(failed) TextButton(onClick={attempt++},modifier=Modifier.align(Alignment.Center).background(Ink),contentPadding=PaddingValues(10.dp)) {Text("Google Maps could not load · Retry",color=Caution,fontSize=12.sp)}
    }
}
