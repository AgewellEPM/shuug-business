package com.ridesharetaxpros.driver.core

import java.net.URI
import java.util.Locale
import kotlinx.serialization.json.*

/** A signed-app pin cannot be downgraded by an unactivated server enrollment. */
object ProtectedTransportPolicy {
    const val CONFIGURATION_ERROR="The app’s protected-workspace configuration needs review. Legacy data transfers are paused."
    const val REPLACEMENT_REQUIRED="This workspace requires client-encrypted data. This action was paused before upload while its protected replacement and migration are completed. Your local data is kept."
    @Volatile var configurationSource:(()->ByteArray?)?=null
    private data class Configuration(val origin:String,val profile:String?)
    private fun configuration(bytes:ByteArray?):Configuration? {
        if(bytes==null)return null
        return runCatching {
            require(bytes.size<=16384)
            val value=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            val common=setOf("version","workspaceOrigin","workspaceId","signerPublicKey")
            require(value["version"] is JsonPrimitive && !value["version"]!!.jsonPrimitive.isString)
            val version=value["version"]?.jsonPrimitive?.intOrNull
            val fields=when(version) {1->common+"firmRecoveryPublicKey";2->common+"profile";else->error("Unsupported protected pins.")}
            require(value.keys==fields)
            for(key in fields-"version")require(value[key] is JsonPrimitive && value[key]!!.jsonPrimitive.isString && value[key]!!.jsonPrimitive.content.isNotEmpty())
            val origin=value["workspaceOrigin"]!!.jsonPrimitive.content
            val uri=URI(origin)
            require(uri.scheme=="https" && uri.host?.contains('.')==true && uri.rawUserInfo==null && uri.rawQuery==null && uri.rawFragment==null && uri.port==-1 && uri.path.isEmpty() && uri.toString()==origin)
            if(version==2) {require(value["profile"]!!.jsonPrimitive.content==ProtectedProfile.CLIENT_ONLY);ProtectedPins.decode(bytes)}
            require(origin!=ProtectedProfile.GIGTAX_ORIGIN || version==2)
            Configuration(origin,if(version==2) ProtectedProfile.CLIENT_ONLY else null)
        }.getOrElse {throw IllegalArgumentException(CONFIGURATION_ERROR,it)}
    }
    fun requiresProtected(origin:String,configuration:ByteArray?):Boolean {
        val selected=configuration(configuration)
        // A client-only build has one independently pinned API. Discovery and
        // saved sessions cannot turn a different host into a legacy workspace.
        require(selected?.profile!=ProtectedProfile.CLIENT_ONLY || origin==selected.origin) {CONFIGURATION_ERROR}
        require(origin!=ProtectedProfile.GIGTAX_ORIGIN || selected?.origin==origin && selected.profile==ProtectedProfile.CLIENT_ONLY) {CONFIGURATION_ERROR}
        return selected?.origin==origin
    }
    private fun readConfiguration():ByteArray? {
        val source=configurationSource ?: error(CONFIGURATION_ERROR)
        return try {source()}catch(failure:Exception) {throw IllegalArgumentException(CONFIGURATION_ERROR,failure)}
    }
    fun requiresProtected(origin:String)=requiresProtected(origin,readConfiguration())
    fun assertAllowedForOrigin(origin:String,path:String,method:String,body:ByteArray?=null) {
        assertAllowed(origin,path,method,body,readConfiguration())
    }
    fun assertAllowed(origin:String,path:String,method:String,body:ByteArray?,configuration:ByteArray?) {
        val selected=configuration(configuration)
        val protected=requiresProtected(origin,configuration)
        if(protected && selected?.profile==ProtectedProfile.CLIENT_ONLY) {
            // The owner-controlled legacy API cannot be used by this profile, including reads.
            require(!path.startsWith("secure/") && path!="driver/session") {REPLACEMENT_REQUIRED}
            assertAllowed(true,path,method,body,ProtectedProfile.CLIENT_ONLY)
        } else assertAllowed(protected,path,method,body)
    }
    fun assertAllowed(protectedWorkspace:Boolean,path:String,method:String,body:ByteArray?=null,profile:String?=null) {
        if(!protectedWorkspace)return
        ProtectedProfile.validate(profile)
        val prefix=if(profile==ProtectedProfile.CLIENT_ONLY) "client-only" else "secure"
        val verb=method.uppercase(Locale.ROOT)
        if(profile==ProtectedProfile.CLIENT_ONLY)require(!path.startsWith("secure/") && path!="driver/session") {REPLACEMENT_REQUIRED}
        if(verb in setOf("GET","HEAD"))return
        // These endpoints carry authenticated ciphertext or enrollment metadata,
        // with their own strict types and account-bound cryptographic validation.
        if(path.startsWith("$prefix/objects/") && verb in setOf("PUT","DELETE")) {
            val id=path.removePrefix("$prefix/objects/")
            if(runCatching {java.util.UUID.fromString(id).toString()==id}.getOrDefault(false)) {
                if(profile==ProtectedProfile.CLIENT_ONLY && verb=="PUT")require(validClientOnlyUpload(id,body)) {REPLACEMENT_REQUIRED}
                return
            }
        }
        if(path=="driver/session" && verb in setOf("POST","DELETE"))return
        if(path=="$prefix/native-session" && verb=="DELETE" && body==null)return
        if(path=="$prefix/native-session" && verb=="POST" && validPrivateSignIn(body))return
        if(path.startsWith("$prefix/social/") && verb=="POST" && validPrivateSocialRequest(path.replace("client-only/","secure/"),body))return
        // Only the explicitly typed new namespace may mutate a client-only
        // workspace. Legacy operational endpoints cannot carry plaintext data.
        if(profile==ProtectedProfile.CLIENT_ONLY)error(REPLACEMENT_REQUIRED)
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

private fun validPrivateSignIn(body:ByteArray?):Boolean=runCatching {
    require(body!=null && body.size in 1..4096)
    val input=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
    when(input.keys) {
        setOf("accountCode","password")-> {
            require(input.values.all {it is JsonPrimitive && it.isString})
            protectedSnapshotID(input["accountCode"]!!.jsonPrimitive.content)
            input["password"]!!.jsonPrimitive.content.length in 1..200
        }
        setOf("challengeToken","code","privateAccount")->input["challengeToken"]!!.jsonPrimitive.let {it.isString && it.content.matches(Regex("[a-f0-9]{64}"))} &&
            input["code"]!!.jsonPrimitive.let {it.isString && it.content.length in 1..40} && input["privateAccount"]!!.jsonPrimitive.let {!it.isString && it.booleanOrNull==true}
        else->false
    }
}.getOrDefault(false)

private fun validPrivateSocialRequest(path:String,body:ByteArray?):Boolean=runCatching {
    require(body!=null&&body.size in 1..4096)
    val input=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
    require(input.values.all {it is JsonPrimitive&&it.isString})
    when(path) {
        "secure/social/start"->input.keys==setOf("provider","audience","purpose","challenge")&&input["provider"]!!.jsonPrimitive.content in setOf("google","apple")&&input["audience"]!!.jsonPrimitive.content=="secure-customer"&&input["purpose"]!!.jsonPrimitive.content in setOf("login","link")&&input["challenge"]!!.jsonPrimitive.content.matches(Regex("[A-Za-z0-9_-]{43}"))
        "secure/social/result"->{require(input.keys==setOf("requestId","verifier"));protectedSnapshotID(input["requestId"]!!.jsonPrimitive.content);input["verifier"]!!.jsonPrimitive.content.matches(Regex("[A-Za-z0-9_-]{43}"))}
        "secure/social/connections"->input.keys==setOf("audience")&&input["audience"]!!.jsonPrimitive.content=="secure-customer"
        "secure/social/unlink"->input.keys==setOf("audience","provider")&&input["audience"]!!.jsonPrimitive.content=="secure-customer"&&input["provider"]!!.jsonPrimitive.content in setOf("google","apple")
        else->false
    }
}.getOrDefault(false)

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

/** A second structural guard on the actual HTTP boundary, in addition to local-key authorization. */
private fun validClientOnlyUpload(id:String,body:ByteArray?):Boolean=runCatching {
    require(body!=null && body.size<=24*1024*1024)
    val value=Wire.parseToJsonElement(body.toString(Charsets.UTF_8)).jsonObject
    require(value.keys==setOf("mutationId","expectedRevision","envelope"))
    protectedSnapshotID(value["mutationId"]!!.jsonPrimitive.content)
    require(!value["expectedRevision"]!!.jsonPrimitive.isString)
    val revision=value["expectedRevision"]!!.jsonPrimitive.int
    val envelope=ProtectedEnvelope.decode(value["envelope"]!!.toString().toByteArray(Charsets.UTF_8))
    require(envelope.version==3 && envelope.profile==ProtectedProfile.CLIENT_ONLY && revision in 0 until 1_000_000_000 && envelope.context.objectId==id && envelope.context.revision==revision+1 && envelope.author.role=="client" && envelope.recipients.size==1)
    val slot=envelope.recipients.single()
    envelope.assertAuthorized(envelope.context,ProtectedEnvelope.Trusted.clientOnly(ProtectedRecipient(slot.keyId,slot.publicKey)))
    true
}.getOrDefault(false)
