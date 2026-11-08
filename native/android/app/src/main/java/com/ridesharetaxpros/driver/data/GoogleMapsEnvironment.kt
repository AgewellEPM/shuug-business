package com.ridesharetaxpros.driver.data

import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.ridesharetaxpros.driver.BuildConfig

fun googleMapUnavailableReason(context: Context): String? {
    if(!BuildConfig.GOOGLE_MAPS_KEY_CONFIGURED) return "In-app Google Maps needs setup by your firm. You can still open Directions in the Google Maps app."
    if(GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)!=ConnectionResult.SUCCESS)
        return "Google Play services needs an update on this device before in-app maps can load. You can still open Directions in Google Maps."
    return null
}
