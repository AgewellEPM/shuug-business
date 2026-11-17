import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}
val gigTaxGoogleMapsKey=providers.gradleProperty("gigtaxGoogleMapsApiKey").orNull?.trim()?.takeIf {it.isNotEmpty()}
    ?: providers.environmentVariable("GIGTAX_GOOGLE_MAPS_ANDROID_KEY").orNull?.trim().orEmpty()
require(gigTaxGoogleMapsKey.isEmpty() || gigTaxGoogleMapsKey.matches(Regex("[A-Za-z0-9_-]{20,256}"))) {
    "Use an Android-restricted Google Maps SDK key through gigtaxGoogleMapsApiKey or GIGTAX_GOOGLE_MAPS_ANDROID_KEY."
}
// Signing credentials are owner-private and never supplied as Gradle CLI arguments.
val gigTaxRepositoryRoot = rootDir.resolve("../..").canonicalFile
val gigTaxSigningPath = providers.environmentVariable("GIGTAX_ANDROID_SIGNING_CONFIG").orNull
val gigTaxSigning = gigTaxSigningPath?.let { configPath ->
    val configFile = file(configPath).canonicalFile
    require(configFile.isFile && !configFile.toPath().startsWith(gigTaxRepositoryRoot.toPath())) {
        "Keep the Android signing configuration outside the source repository."
    }
    Properties().apply { configFile.inputStream().use { load(it) } }
}
val gigTaxVersionCode = providers.gradleProperty("gigTaxVersionCode").orNull?.toInt() ?: 1
require(gigTaxVersionCode in 1..2100000000) { "Invalid Google Play version code." }
android {
    namespace = "com.ridesharetaxpros.driver"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.ridesharetaxpros.driver"
        minSdk = 26
        targetSdk = 36
        versionCode = gigTaxVersionCode
        versionName = providers.gradleProperty("gigTaxVersionName").orNull ?: "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["gigtaxGoogleMapsApiKey"]=gigTaxGoogleMapsKey
        buildConfigField("boolean","GOOGLE_MAPS_KEY_CONFIGURED",gigTaxGoogleMapsKey.isNotEmpty().toString())
    }
    signingConfigs {
        if (gigTaxSigning != null) create("playRelease") {
            storeFile = file(requireNotNull(gigTaxSigning.getProperty("storeFile"))).canonicalFile.also {
                require(it.isFile && !it.toPath().startsWith(gigTaxRepositoryRoot.toPath())) {
                    "Keep the private upload keystore outside the source repository."
                }
            }
            storePassword = requireNotNull(gigTaxSigning.getProperty("storePassword"))
            keyAlias = requireNotNull(gigTaxSigning.getProperty("keyAlias"))
            keyPassword = requireNotNull(gigTaxSigning.getProperty("keyPassword"))
            storeType = "PKCS12"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }
    buildTypes {
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
            if (gigTaxSigning != null) signingConfig = signingConfigs.getByName("playRelease")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    testOptions { unitTests.isReturnDefaultValues = true }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.10.01"))
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.bouncycastle:bcprov-jdk18on:1.86")
    implementation("com.plaid.link:sdk-core:6.4.0")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.android.gms:play-services-maps:20.1.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.10.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// Refuse to produce an unsigned release that could be mistaken for a distributable.
tasks.matching { it.name in setOf("packageRelease", "signReleaseBundle", "bundleRelease", "assembleRelease") }
    .configureEach { doFirst { check(gigTaxSigning != null) { "Set GIGTAX_ANDROID_SIGNING_CONFIG to the private signing properties file." } } }
