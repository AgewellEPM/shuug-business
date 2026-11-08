package com.ridesharetaxpros.driver.core

import java.net.URI
import java.util.Locale
import kotlinx.serialization.json.*

/** A signed-app pin cannot be downgraded by an unactivated server enrollment. */
object ProtectedTransportPolicy {
    const val CONFIGURATION_ERROR="The app’s protected-workspace configuration needs review. Legacy data transfers are paused."
    const val REPLACEMENT_REQUIRED="This workspace requires client-encrypted data. This action was paused before upload while its protected replacement and migration are completed. Your local data is kept."
    @Volatile var configurationSource:(()->ByteArray?)?=null
    fun requiresProtected(origin:String,configuration:ByteArray?):Boolean {
        if(configuration==null)return false
        val pinned=runCatching {
            require(configuration.size<=16384)
            val value=Wire.parseToJsonElement(configuration.toString(Charsets.UTF_8)).jsonObject
            require(value.keys==setOf("version","workspaceOrigin","workspaceId","signerPublicKey","firmRecoveryPublicKey"))
            require(value["version"]?.jsonPrimitive?.intOrNull==1)
            for(key in listOf("workspaceOrigin","workspaceId","signerPublicKey","firmRecoveryPublicKey"))require(value[key]!!.jsonPrimitive.isString && value[key]!!.jsonPrimitive.content.isNotEmpty())
            value["workspaceOrigin"]!!.jsonPrimitive.content.also {text->val uri=URI(text)
                require(uri.scheme=="https" && uri.host?.contains('.')==true && uri.rawUserInfo==null && uri.rawQuery==null && uri.rawFragment==null && uri.port==-1 && uri.path.isEmpty() && uri.toString()==text)
            }
        }.getOrElse {throw IllegalArgumentException(CONFIGURATION_ERROR,it)}
        return origin==pinned
    }
    fun requiresProtected(origin:String):Boolean {
        val source=configurationSource ?: error(CONFIGURATION_ERROR)
        val configuration=try {source()}catch(failure:Exception) {throw IllegalArgumentException(CONFIGURATION_ERROR,failure)}
        return requiresProtected(origin,configuration)
    }
    fun assertAllowed(protectedWorkspace:Boolean,path:String,method:String,body:ByteArray?=null) {
        if(!protectedWorkspace)return
        val verb=method.uppercase(Locale.ROOT)
        if(verb in setOf("GET","HEAD"))return
        // These endpoints carry authenticated ciphertext or enrollment metadata,
        // with their own strict types and account-bound cryptographic validation.
        if(path.startsWith("secure/objects/") && verb in setOf("PUT","DELETE")) {
            val id=path.removePrefix("secure/objects/")
            if(runCatching {java.util.UUID.fromString(id).toString()==id}.getOrDefault(false))return
        }
        if(path=="driver/session" && verb in setOf("POST","DELETE"))return
        // A parked driver explicitly requests these operational endpoints. This
        // does not authorize uploading saved journals, routes or other tax data.
        if(path=="driver/routes" && verb=="POST" && validOperationalRouteRequest(body))return
        if(path=="driver/banks" && verb=="POST" && body!=null) {
            val cancellation=runCatching {
                val input=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
                require(input.values.all {it is JsonPrimitive && it.isString})
                when(input["action"]?.jsonPrimitive?.content) {
                    "disconnect"->input.keys==setOf("action","itemId") && input["itemId"]!!.jsonPrimitive.content.isNotEmpty()
                    "cancel"->input.keys==setOf("action","sessionId") && input["sessionId"]!!.jsonPrimitive.content.isNotEmpty()
                    else->false
                }
            }.getOrDefault(false)
            if(cancellation)return
        }
        error(REPLACEMENT_REQUIRED)
    }
}

internal fun validOperationalRouteRequest(body: ByteArray?): Boolean = runCatching {
    require(body!=null && body.size in 1..4096)
    val input=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
    require(input.keys==setOf("origin","destination","alternatives"))
    val alternatives=input["alternatives"]!!.jsonPrimitive
    require(!alternatives.isString && alternatives.booleanOrNull!=null)
    for(key in listOf("origin","destination")) {
        val point=input[key]!!.jsonObject;require(point.keys==setOf("latitude","longitude"))
        for((coordinate,range) in listOf("latitude" to -90.0..90.0,"longitude" to -180.0..180.0)) {
            val value=point[coordinate]!!.jsonPrimitive;val number=value.doubleOrNull
            require(!value.isString && number!=null && number.isFinite() && number in range)
        }
    }
    true
}.getOrDefault(false)
