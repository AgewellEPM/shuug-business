package com.ridesharetaxpros.driver.tracking

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.ridesharetaxpros.driver.MainActivity
import com.ridesharetaxpros.driver.R
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*

object TripAlertNotifications {
    fun start(repo: DriverRepository)=publish(repo,"start","Start a new trip?","Driving detected. Answer when safely parked. Recording starts when you confirm.")
    fun end(repo: DriverRepository)=repo.journal.activeTripId?.let {publish(repo,"end","Have you finished this trip?","End and save here, or keep recording.",tripId=it)}
    fun expense(repo: DriverRepository,prompt: ExpensePrompt)=publish(repo,"expense","Purchase near ${prompt.merchant}?","Reply with an amount to save for review, or choose Not a purchase.",promptId=prompt.id)
    fun completed(repo: DriverRepository,id: String)=publish(repo,"classify","Drive saved. Business or personal?","Choose the classification here without opening the app.",tripId=id)
    private fun publish(repo: DriverRepository,kind: String,title: String,text: String,tripId: String?=null,promptId: String?=null) {
        if(Build.VERSION.SDK_INT>=33 && repo.app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
        val (next,token)=repo.journal.prepareTripAlert(kind,repo.scope,tripId,promptId)
        if(next==repo.journal) return
        repo.update {next}
        val manager=repo.app.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("trip-actions","Trip and expense actions",NotificationManager.IMPORTANCE_HIGH))
        val open=PendingIntent.getActivity(repo.app,0,Intent(repo.app,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(repo.app,"trip-actions").setSmallIcon(R.drawable.brand_mark).setContentTitle(title)
            .setContentText(text).setStyle(Notification.BigTextStyle().bigText(text)).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true)
        fun add(action: String,label: String,input: String?=null) {
            val intent=Intent(repo.app,if(action=="start" || action=="end") DriveService::class.java else TripAlertReceiver::class.java)
                .setAction("TRIP_ALERT").setData(Uri.parse("gigtaxpros://trip-alert/${token.id}/$action"))
                .putExtra("alertId",token.id).putExtra("alertAction",action).putExtra("scope",repo.scope)
            val flags=PendingIntent.FLAG_UPDATE_CURRENT or if(input==null) PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_MUTABLE
            val pending=if(action=="start" || action=="end") PendingIntent.getForegroundService(repo.app,0,intent,flags) else PendingIntent.getBroadcast(repo.app,0,intent,flags)
            val button=Notification.Action.Builder(null,label,pending)
            if(input!=null) button.addRemoteInput(RemoteInput.Builder("value").setLabel(input).build())
            notification.addAction(button.build())
        }
        when(kind) {
            "start" -> {add("start","Yes, start trip");add("dismiss","Not now")}
            "end" -> {add("end","Yes, end trip");add("keep","Keep recording")}
            "classify" -> {add("business","Business");add("personal","Personal");add("dismiss","Later")}
            "fare" -> {add("fare","Add earnings","fare=20 fees=3");add("dismiss","Later")}
            "expense" -> {add("expense","Log amount","12.34");add("dismiss","Not a purchase")}
        }
        manager.notify(token.id.hashCode(),notification.build())
    }
    fun perform(repo: DriverRepository,intent: Intent): String {
        val scope=intent.getStringExtra("scope") ?: error("The alert account is unavailable.")
        require(scope==repo.scope) {"This alert belongs to another account."}
        val id=intent.getStringExtra("alertId") ?: error("The alert is unavailable.")
        val action=intent.getStringExtra("alertAction") ?: error("Choose a trip action.")
        val value=RemoteInput.getResultsFromIntent(intent)?.getCharSequence("value")?.toString()
        val result=repo.journal.applyTripAlert(id,action,scope,value)
        if(result.result=="already") return "already"
        repo.update {result.journal}
        repo.app.getSystemService(NotificationManager::class.java).cancel(id.hashCode())
        if(action=="end" && result.recordId!=null) completed(repo,result.recordId)
        if(action=="business") publish(repo,"fare","Add this drive’s earnings?","Reply fare=20 fees=3 using your actual amounts. Include tips in fare.",tripId=result.recordId)
        repo.run {repo.sync()}
        return action
    }
    fun cancelEnds(repo: DriverRepository) {
        val ids=repo.journal.tripAlerts.filter {it.kind=="end" && it.tripId==repo.journal.activeTripId && it.handledAt==null}.map {it.id}.toSet()
        if(ids.isEmpty()) return
        repo.update {it.copy(tripAlerts=it.tripAlerts.map {row->if(row.id in ids) row.copy(handledAt=now()) else row})}
        val manager=repo.app.getSystemService(NotificationManager::class.java);ids.forEach {manager.cancel(it.hashCode())}
    }
}
class TripAlertReceiver: BroadcastReceiver() {
    override fun onReceive(context: Context,intent: Intent) {
        val repo=(context.applicationContext as DriverApplication).repository
        try {TripAlertNotifications.perform(repo,intent)} catch(error: Exception) {repo.failure=error.message}
    }
}
