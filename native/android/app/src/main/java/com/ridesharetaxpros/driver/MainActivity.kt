package com.ridesharetaxpros.driver

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.ridesharetaxpros.driver.data.DriverApplication
import com.ridesharetaxpros.driver.ui.DriverApp
import com.ridesharetaxpros.driver.offers.OfferScreenshot

class MainActivity: ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge()
        setContent { DriverApp((application as DriverApplication).repository) }
        if(savedInstanceState==null) handleOfferIntent(intent)
    }
    override fun onNewIntent(intent: Intent) {super.onNewIntent(intent);setIntent(intent);handleOfferIntent(intent)}
    private fun handleOfferIntent(intent: Intent) {
        val repo=(application as DriverApplication).repository
        if(intent.getBooleanExtra("openOfferReader",false)) repo.requestedOfferReader=true
        if(intent.action==Intent.ACTION_SEND && intent.type?.startsWith("image/")==true) {
            intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let {OfferScreenshot.read(repo,it)}
        }
    }
}
