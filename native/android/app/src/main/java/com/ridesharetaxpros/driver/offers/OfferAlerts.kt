package com.ridesharetaxpros.driver.offers

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
import java.time.Instant

object OfferAlerts {
    fun ingest(repo: DriverRepository,text: String,source: String,scope: String,session: String,platform: String? = null) {
        if(repo.scope!=scope || repo.journal.offerReader.id!=session || !repo.storageReady) return
        val settings=platform?.let {repo.journal.offerReader.copy(platform=it)} ?: repo.journal.offerReader
        val offer=GigOfferTextReader.read(text,settings,source) ?: return
        val previous=repo.journal.observedOffers.lastOrNull {it.fingerprint==offer.fingerprint &&
                runCatching {java.time.Duration.between(Instant.parse(it.observedAt),Instant.now()).seconds in 0..120}.getOrDefault(false)}
        val merged=previous?.let {mergeObservedOffer(it,offer)} ?: offer
        if(merged==previous) return
        repo.update {it.copy(observedOffers=(it.observedOffers.filterNot {raw->raw.id==merged.id}+merged).takeLast(100))}
        if(previous==null || previous.withdrawn!=merged.withdrawn || previous.expiresAt!=merged.expiresAt) publish(repo,merged)
    }
    private fun publish(repo: DriverRepository,offer: ObservedGigOffer) {
        val app=repo.app; val manager=app.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("offers","Gig offer comparisons",NotificationManager.IMPORTANCE_HIGH))
        if(Build.VERSION.SDK_INT>=33 && app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
        val estimate=offer.estimate(repo.journal.offerReader,repo.journal.goals)
        val title="${offer.platform}: ${offer.payoutCents?.let {money(it)} ?: "payout unknown"}"
        val details=if(!offer.fresh()) "This captured offer is expired, withdrawn or old. Recheck it in the original gig app."
            else if(estimate!=null) "${money(estimate.netCents)} estimated net · ${money(estimate.hourlyCents)}/active hour. Confirm ${offer.miles} total mi, ${offer.minutes} min, ${money(repo.journal.offerReader.feesCents!!)} fees, ${repo.journal.offerReader.waitMinutes} min wait. Home impact unknown."
            else "Some payout, total miles, time or cost settings are missing. Review before calculating."
        val open=PendingIntent.getActivity(app,0,Intent(app,MainActivity::class.java).putExtra("openOfferReader",true),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(app,"offers").setSmallIcon(R.drawable.brand_mark).setContentTitle(title)
            .setContentText(details).setStyle(Notification.BigTextStyle().bigText(details)).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(open).setAutoCancel(true)
        if(estimate!=null) {
            val intent=Intent(app,OfferActionReceiver::class.java).setAction("CONFIRM").setData(Uri.parse("gigtaxpros://offer/${offer.id}/confirm"))
                .putExtra("offerId",offer.id).putExtra("scope",repo.scope).putExtra("session",offer.readerSession)
            val confirm=PendingIntent.getBroadcast(app,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            notification.addAction(Notification.Action.Builder(null,"Confirm & save comparison",confirm).build())
        }
        manager.notify(offer.id.hashCode(),notification.build())
    }
    fun confirm(repo: DriverRepository,id: String,scope: String,session: String) {
        require(repo.scope==scope && repo.journal.offerReader.id==session) {"This offer belongs to another reading session or account."}
        val offer=repo.journal.observedOffers.firstOrNull {it.id==id} ?: error("This offer is unavailable.")
        if(offer.comparisonSavedAt!=null) return
        require(offer.fresh() && offer.estimate(repo.journal.offerReader,repo.journal.goals)!=null) {"This observation is old or incomplete. Check the current offer."}
        repo.update {it.copy(observedOffers=it.observedOffers.map {row->if(row.id==id) row.copy(comparisonSavedAt=now()) else row})}
    }
    private fun money(cents: Int)=java.text.NumberFormat.getCurrencyInstance(java.util.Locale.US).format(cents/100.0)
}

class OfferActionReceiver: BroadcastReceiver() {
    override fun onReceive(context: Context,intent: Intent) {
        val repo=(context.applicationContext as DriverApplication).repository
        try { OfferAlerts.confirm(repo,intent.getStringExtra("offerId") ?: return,intent.getStringExtra("scope") ?: return,intent.getStringExtra("session") ?: return)
            context.getSystemService(NotificationManager::class.java).cancel(intent.getStringExtra("offerId")!!.hashCode())
        } catch(error: Exception) {repo.failure=error.message}
    }
}
