package com.ridesharetaxpros.driver.core

data class GigAppEntry(val id:String,val name:String,val packageName:String,val iconFile:String) {
    val storeURL get()="https://play.google.com/store/apps/details?id=$packageName"
}
// Publisher identities verified against each official Google Play listing on
// 2026-11-07. A label match alone must not launch an unrelated installed app.
val gigAppCatalog=listOf(
    GigAppEntry("lyft-driver","Lyft Driver","com.lyft.android.driver","PlatformLyftIcon.jpg"),
    GigAppEntry("uber-driver","Uber Driver","com.ubercab.driver","PlatformUberIcon.jpg"),
    GigAppEntry("doordash-dasher","Dasher","com.doordash.driverapp","PlatformDoorDashIcon.jpg"),
    GigAppEntry("spark-driver","Spark Driver","com.walmart.sparkdriver","PlatformSparkIcon.jpg"),
    GigAppEntry("instacart-shopper","Instacart Shopper","com.instacart.shopper","PlatformInstacartIcon.jpg"),
    GigAppEntry("amazon-flex","Amazon Flex","com.amazon.flex.rabbit","GigAppAmazonFlexIcon.jpg"),
    GigAppEntry("grubhub-driver","Grubhub Driver","com.grubhub.driver","GigAppGrubhubDriverIcon.jpg"),
    GigAppEntry("roadie-driver","Roadie Driver","com.roadie.drive.android.app","GigAppRoadieDriverIcon.jpg"),
    GigAppEntry("shipt-shopper","Shipt Shopper","com.shipt.shopper","GigAppShiptShopperIcon.jpg"),
    GigAppEntry("gopuff-driver","Gopuff Driver","com.gopuff.godrive2.live","GigAppGopuffDriverIcon.jpg"),
    GigAppEntry("taskrabbit-tasker","Tasker","com.taskrabbit.droid.rabbit","GigAppTaskrabbitTaskerIcon.jpg"),
    GigAppEntry("rover","Rover","com.rover.android","GigAppRoverIcon.jpg"),
    GigAppEntry("wag-caregiver","Wag! Caregiver","com.wag.walker","GigAppWagCaregiverIcon.jpg"),
    GigAppEntry("favor-runner","Favor Runner","com.neighbfav.neighborfavor.runner","GigAppFavorRunnerIcon.jpg"),
    GigAppEntry("curri-driver","Curri Driver","com.Curri.Driver","GigAppCurriDriverIcon.jpg"),
    GigAppEntry("goshare-driver","GoShare Driver","co.goshare.driverapp","GigAppGoShareDriverIcon.jpg"),
    GigAppEntry("veho-driver","Veho Driver","com.vehotechnologies.Driver","GigAppVehoDriverIcon.jpg"),
    GigAppEntry("dispatch-driver","Dispatch","com.dispatchit","GigAppDispatchDriverIcon.jpg"),
    GigAppEntry("skipcart-driver","Skipcart","com.skipcart.app.mobile.prod","GigAppSkipcartDriverIcon.jpg")
)
