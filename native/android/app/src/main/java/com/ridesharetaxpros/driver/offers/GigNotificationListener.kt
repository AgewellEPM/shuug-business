package com.ridesharetaxpros.driver.offers

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.ridesharetaxpros.driver.data.DriverApplication

class GigNotificationListener: NotificationListenerService() {
    override fun onNotificationPosted(notification: StatusBarNotification) {
        val repo=(application as DriverApplication).repository
        val settings=repo.journal.offerReader
        if(!settings.active() || notification.packageName !in settings.allowedPackages ||
            notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val extras=notification.notification.extras
        val text=listOfNotNull(extras.getCharSequence(Notification.EXTRA_TITLE),extras.getCharSequence(Notification.EXTRA_TEXT),
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)).joinToString("\n").take(20000)
        try { OfferAlerts.ingest(repo,text,"notification",repo.scope,settings.id,settings.appPlatforms[notification.packageName]) }
        catch(error: Exception) {repo.failure=error.message}
    }
}
