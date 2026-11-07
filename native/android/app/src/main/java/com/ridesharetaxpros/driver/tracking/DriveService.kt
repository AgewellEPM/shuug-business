package com.ridesharetaxpros.driver.tracking

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import com.ridesharetaxpros.driver.MainActivity
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import java.time.Instant
import java.time.Duration
import kotlinx.coroutines.*

/** User-started foreground service: Android keeps a visible location notification. */
class DriveService: Service(),LocationListener {
    private val repo get()=(application as DriverApplication).repository
    private lateinit var locations: LocationManager
    private val jobs=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private var previous: LocationFix?=null
    private var movingAt: Instant?=null
    private var movingDistance=0.0
    private var stopAt: Instant?=null
    private var stopAnchor: LocationFix?=null
    private var suppressedUntil=Instant.EPOCH
    private var lastLookup=Instant.EPOCH
    private var lookupBusy=false
    private val buffer=ArrayDeque<LocationFix>()
    override fun onBind(intent: Intent?)=null
    override fun onCreate() {
        super.onCreate(); locations=getSystemService(LocationManager::class.java)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("driving","Driving and expense reminders",NotificationManager.IMPORTANCE_DEFAULT))
    }
    override fun onStartCommand(intent: Intent?,flags: Int,startId: Int): Int {
        try {
            if(intent?.action=="TRIP_ALERT") {
                if(intent.getStringExtra("alertAction")=="start") require(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED) {"Allow precise location before starting a trip from an alert."}
                val action=TripAlertNotifications.perform(repo,intent)
                if(action=="end") suppressedUntil=Instant.now().plusSeconds(300)
            }
            if(intent?.action=="END_CURRENT") {
                require(intent.getStringExtra("scope")==repo.scope && intent.getStringExtra("tripId")==repo.journal.activeTripId) {"Your trip or account changed. The current trip was not changed."}
                val completed=repo.journal.activeTripId;repo.endDrive();suppressedUntil=Instant.now().plusSeconds(300)
                if(completed!=null) TripAlertNotifications.completed(repo,completed)
            }
            if(intent?.action=="STOP") { repo.endDrive(); suppressedUntil=Instant.now().plusSeconds(300) }
            if(intent?.action=="OFF") { stopSelf(); return START_NOT_STICKY }
            if(intent?.action=="START" && repo.journal.activeTripId==null) repo.startDrive()
            if(repo.journal.activeTripId==null && !repo.journal.assistance.automaticDrives && !repo.journal.assistance.placeReminders) { stopSelf(); return START_NOT_STICKY }
            check(repo.storageReady); require(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED) { "Allow precise location while using the app, then start tracking again." }
            startForeground(1,notification("Location tracking active",if(repo.journal.activeTripId==null) "Watching for driving and nearby stops" else "Recording your drive. Tap to review or end."))
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,5000,0f,this,mainLooper)
            repo.trackingStatus="Tracking active · persistent notification on"
        } catch(error: Exception) { repo.failure=error.message; stopSelf() }
        return START_NOT_STICKY
    }
    private fun notification(title: String,text: String): Notification {
        val launch=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,1,Intent(this,DriveService::class.java).setAction("OFF"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder=Notification.Builder(this,"driving").setSmallIcon(R.drawable.brand_mark).setContentTitle(title).setContentText(text)
            .setContentIntent(launch).setOnlyAlertOnce(true).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(Notification.Action.Builder(null,"Pause tracking",stop).build())
        repo.journal.activeTripId?.let {id->
            val end=PendingIntent.getForegroundService(this,2,Intent(this,DriveService::class.java).setAction("END_CURRENT")
                .setData(android.net.Uri.parse("gigtaxpros://drive/$id/end")).putExtra("tripId",id).putExtra("scope",repo.scope),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(Notification.Action.Builder(null,"End trip",end).build())
        }
        return builder.build()
    }
    override fun onLocationChanged(location: Location) {
        try {
            val clock=Instant.now(); val time=Instant.ofEpochMilli(location.time)
            if(!location.hasAccuracy() || location.accuracy>50 || Duration.between(time,clock).seconds !in -5..20) return
            val fix=LocationFix(location.latitude,location.longitude,location.accuracy.toDouble(),time.toString())
            val last=previous; val delta=last?.let { Duration.between(Instant.parse(it.timestamp),time).toMillis()/1000.0 }
            if(delta!=null && delta<=0) return
            if(delta!=null && delta>90) { movingAt=null; movingDistance=0.0; stopAt=null; stopAnchor=null; buffer.clear() }
            val distance=last?.distance(fix) ?: 0.0
            val speed=if(location.hasSpeed()) location.speed.toDouble() else if(delta!=null && delta>0) distance/delta else 0.0
            if(speed>65 || delta!=null && delta>0 && delta<=90 && distance/delta>65) return
            previous=fix; buffer.add(fix); while(buffer.size>18) buffer.removeFirst()
            if(repo.journal.activeTripId!=null) repo.observe(fix)
            if(speed>=3.5) {
                TripAlertNotifications.cancelEnds(repo)
                if(movingAt==null) movingAt=time; movingDistance+=distance; stopAt=null; stopAnchor=null
                if(repo.journal.assistance.automaticDrives && repo.journal.activeTripId==null && clock>suppressedUntil &&
                    Duration.between(movingAt,time).seconds>=45 && movingDistance>=120) {
                    TripAlertNotifications.start(repo);suppressedUntil=clock.plusSeconds(300)
                    repo.trackingStatus="Driving detected · answer the start-trip alert when safely parked"
                }
            } else if(speed<=1.4) {
                if(stopAt==null || stopAnchor!!.distance(fix)>70) { stopAt=time; stopAnchor=fix }
                val stopped=Duration.between(stopAt,time).seconds
                if(stopped>=90 && repo.journal.assistance.placeReminders && !lookupBusy && Duration.between(lastLookup,clock).seconds>=600) lookup(fix)
                if(stopped>=300) { if(repo.journal.activeTripId!=null) TripAlertNotifications.end(repo); movingAt=null; movingDistance=0.0; buffer.clear() }
            } else { stopAt=null; stopAnchor=null }
        } catch(error: Exception) { repo.failure=error.message; stopSelf() }
    }
    private fun lookup(fix: LocationFix) {
        val clock=Instant.now(); val prompts=repo.journal.placePrompts
        if(prompts.count { it.detectedAt.take(10)==now().take(10) }>=6) return
        lastLookup=clock; lookupBusy=true; val scope=repo.scope
        jobs.launch { try {
            val place=NearbyPlaces.find(fix) ?: return@launch
            if(repo.scope!=scope || !repo.journal.assistance.placeReminders || previous?.distance(fix)?.let { it>90 }!=false) return@launch
            if(prompts.any { it.placeId==place.placeId && Duration.between(Instant.parse(it.detectedAt),clock).seconds<21600 }) return@launch
            repo.update { it.copy(placePrompts=(it.placePrompts+place).takeLast(100)) }
            if(Build.VERSION.SDK_INT<33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
                TripAlertNotifications.expense(repo,place)
        } catch(_: Exception) { repo.trackingStatus="Tracking active · nearby places temporarily unavailable" } finally { lookupBusy=false } }
    }
    override fun onProviderDisabled(provider: String) { repo.trackingStatus="GPS is off. The trip may have gaps." }
    override fun onDestroy() {
        locations.removeUpdates(this); jobs.cancel()
        try { repo.pauseDrive() } catch(_: Exception) { /* update() already reports storage failure */ }
        repo.trackingStatus=if(repo.journal.activeTripId!=null) "Tracking paused. Resume or end the drive." else "Tracking is off"
        super.onDestroy()
    }
}
