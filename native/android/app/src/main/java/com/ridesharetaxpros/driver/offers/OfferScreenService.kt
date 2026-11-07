package com.ridesharetaxpros.driver.offers

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.*
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.*
import android.os.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.data.DriverApplication
import java.time.Duration
import java.time.Instant

/** Only started after the user's Android screen-sharing consent. No control API. */
class OfferScreenService: Service() {
    private val repo get()=(application as DriverApplication).repository
    private val worker=HandlerThread("GigOfferFrames")
    private val main=Handler(Looper.getMainLooper())
    private var projection: MediaProjection?=null
    private var display: VirtualDisplay?=null
    private var images: ImageReader?=null
    private val scanner=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    @Volatile private var busy=false
    @Volatile private var closing=false
    private var lastFrame=0L
    private var scope=""
    private var session=""
    private val callback=object: MediaProjection.Callback() {
        override fun onStop() {stopSelf()}
        override fun onCapturedContentResize(width: Int,height: Int) {
            if(Build.VERSION.SDK_INT>=34 && display!=null) resize(width,height)
        }
    }
    override fun onBind(intent: Intent?)=null
    override fun onCreate() {super.onCreate();worker.start()}
    override fun onStartCommand(intent: Intent?,flags: Int,startId: Int): Int {
        if(intent?.action=="STOP") {stopSelf();return START_NOT_STICKY}
        if(projection!=null) return START_NOT_STICKY
        try {
            val settings=repo.journal.offerReader
            check(settings.active()) {"Enable the offer reader for this shift first."}
            scope=repo.scope;session=settings.id
            val data=intent?.getParcelableExtra<Intent>("projectionData") ?: error("Screen sharing needs your approval.")
            val result=intent.getIntExtra("projectionResult",Activity.RESULT_CANCELED)
            require(result==Activity.RESULT_OK)
            val manager=getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("offer-screen","Offer screen reading",NotificationManager.IMPORTANCE_LOW))
            val stop=PendingIntent.getService(this,0,Intent(this,OfferScreenService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notice=Notification.Builder(this,"offer-screen").setSmallIcon(R.drawable.brand_mark).setContentTitle("Gig Tax Pros screen reading")
                .setContentText("Reading visible offers on this device. Tap Stop before opening private apps.").setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE).addAction(Notification.Action.Builder(null,"Stop reading",stop).build()).build()
            if(Build.VERSION.SDK_INT>=29) startForeground(3,notice,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(3,notice)
            projection=getSystemService(MediaProjectionManager::class.java).getMediaProjection(result,data)
            projection!!.registerCallback(callback,main)
            val metrics=resources.displayMetrics
            resize(metrics.widthPixels,metrics.heightPixels)
            repo.offerReaderStatus="Screen sharing active · on-device text reading"
            val remaining=Duration.between(Instant.now(),Instant.parse(settings.expiresAt)).toMillis().coerceAtLeast(1)
            main.postDelayed({stopSelf()},remaining)
        } catch(error: Exception) {repo.offerReaderStatus=error.message ?: "Screen sharing could not start.";stopSelf()}
        return START_NOT_STICKY
    }
    private fun resize(originalWidth: Int,originalHeight: Int) {
        if(originalWidth<=0 || originalHeight<=0 || closing) return
        val scale=minOf(1.0,1280.0/maxOf(originalWidth,originalHeight))
        val width=(originalWidth*scale).toInt().coerceAtLeast(1);val height=(originalHeight*scale).toInt().coerceAtLeast(1)
        val next=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2)
        next.setOnImageAvailableListener({reader->
            val image=try {reader.acquireLatestImage()} catch(_: IllegalStateException) {null} ?: return@setOnImageAvailableListener
            var bitmap: Bitmap?=null
            try {
                val tick=SystemClock.elapsedRealtime()
                if(closing || busy || tick-lastFrame<1000) return@setOnImageAvailableListener
                if(repo.scope!=scope || repo.journal.offerReader.id!=session || !repo.journal.offerReader.active()) {main.post {stopSelf()};return@setOnImageAvailableListener}
                val plane=image.planes.first();if(plane.pixelStride!=4) return@setOnImageAvailableListener
                val padded=Bitmap.createBitmap(plane.rowStride/plane.pixelStride,image.height,Bitmap.Config.ARGB_8888)
                plane.buffer.rewind();padded.copyPixelsFromBuffer(plane.buffer)
                bitmap=Bitmap.createBitmap(padded,0,0,image.width,image.height)
                if(bitmap!==padded) padded.recycle()
                busy=true;lastFrame=tick
            } catch(_: Exception) {bitmap?.recycle();bitmap=null} finally {image.close()}
            val frame=bitmap ?: return@setOnImageAvailableListener
            scanner.process(InputImage.fromBitmap(frame,0)).addOnSuccessListener {result->
                if(!closing) try {OfferAlerts.ingest(repo,result.text,"screenShare",scope,session)} catch(error: Exception) {repo.offerReaderStatus=error.message ?: "Offer reading needs attention."}
            }.addOnFailureListener {if(!closing) repo.offerReaderStatus="Visible text could not be read. Share a screenshot instead."}
                .addOnCompleteListener {frame.recycle();busy=false}
        },Handler(worker.looper))
        val old=images;images=next
        if(display==null) display=projection?.createVirtualDisplay("Gig Tax Pros Offer Reader",width,height,resources.displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,next.surface,null,main)
        else {display?.resize(width,height,resources.displayMetrics.densityDpi);display?.surface=next.surface}
        old?.setOnImageAvailableListener(null,null);old?.close()
    }
    override fun onDestroy() {
        closing=true;main.removeCallbacksAndMessages(null)
        images?.setOnImageAvailableListener(null,null);display?.release();images?.close()
        projection?.unregisterCallback(callback);projection?.stop();scanner.close();worker.quitSafely()
        repo.offerReaderStatus="Screen sharing is off. Approve a new session to resume."
        super.onDestroy()
    }
}
