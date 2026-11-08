plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.3.10" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.10" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.10" apply false
}

// Keep optional verification output away from a nearly-full system disk.
providers.gradleProperty("gigTaxBuildRoot").orNull?.let { output ->
    allprojects { layout.buildDirectory.set(file("$output/${project.name}")) }
}
