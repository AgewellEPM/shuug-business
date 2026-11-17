package com.ridesharetaxpros.driver.data

import com.ridesharetaxpros.driver.core.*
import java.net.HttpURLConnection
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Serializable data class ClientAccount(val id: String,val name: String,val email: String)
@Serializable data class WorkspaceBrand(val name: String,val primaryColor: String,val accentColor: String)
@Serializable data class LoginReply(val apiVersion: Int,val token: String,val expiresAt: String,val account: ClientAccount,val branding: WorkspaceBrand)
@Serializable enum class AccountAccess { LEGACY, PRIVATE }
@Serializable data class Connection(val origin: String,val session: LoginReply,val access:AccountAccess=AccountAccess.LEGACY,val privateClientId:String?=null,val encryptionProfile:String?=null) {
    val storageNamespace get():String {
        if(encryptionProfile==null)return PrivateStore.hash(origin+"|"+session.account.id)
        require(encryptionProfile==ProtectedProfile.CLIENT_ONLY && access==AccountAccess.PRIVATE && privateClientId!=null) {"The local private account profile is invalid."}
        return PrivateStore.hash(origin+"|"+encryptionProfile+"|"+session.account.id+"|"+privateClientId)
    }
}
@Serializable data class Failure(val error: String? = null,val current: ServerRecord? = null)
class WorkspaceError(val status: Int,message: String,val current: ServerRecord? = null): Exception(message)
@Serializable data class BankItem(val id: String,val label: String,val environment: String,val lastSync: String? = null,val error: String? = null,val connected: Int)
@Serializable data class BankStatus(val ready: Boolean,val environment: String,val reason: String,val items: List<BankItem>)
@Serializable data class BankFeed(val transactions: List<BankTransaction>,val cursor: Long,val hasMore: Boolean)

class WorkspaceClient(val connection: Connection? = null,private val address: String = connection?.origin ?: "") {
    suspend fun send(path: String,method: String="GET",body: ByteArray?=null,mime: String="application/json"): ByteArray = request("driver/"+path,method,body,mime,8*1024*1024)
    suspend fun customer(path: String,method: String="GET",body: ByteArray?=null,mime: String="application/json",maximum:Int=8*1024*1024,allowMfaChallenge:Boolean=false): ByteArray = request(path,method,body,mime,maximum,allowMfaChallenge)
    private suspend fun request(path: String,method: String,body: ByteArray?,mime: String,maximum:Int,allowMfaChallenge:Boolean=false): ByteArray = withContext(Dispatchers.IO) {
        require(!path.startsWith("/") && !path.contains("..") && !path.contains("#")) {"Invalid workspace path."}
        ProtectedTransportPolicy.assertAllowedForOrigin(address,path,method,body)
        val url=URI(address+"/api/website/customer/"+path).toURL()
        val request=url.openConnection() as HttpURLConnection
        try {
            request.instanceFollowRedirects=false; request.requestMethod=method; request.connectTimeout=20000; request.readTimeout=60000
            request.setRequestProperty("Accept","application/json"); request.setRequestProperty("Cache-Control","no-store")
            connection?.let { request.setRequestProperty("Authorization","Bearer "+it.session.token) }
            body?.let { request.doOutput=true; request.setRequestProperty("Content-Type",mime); request.setFixedLengthStreamingMode(it.size); request.outputStream.use { stream -> stream.write(it) } }
            val status=request.responseCode
            val stream=if(status in 200..299) request.inputStream else request.errorStream
            val data=stream?.use { boundedRead(it,maximum) } ?: byteArrayOf()
            require(data.size<=maximum) { "The workspace response is too large." }
            if(status !in 200..299 && !(allowMfaChallenge && status==428 && path in setOf("secure/native-session","client-only/native-session") && method=="POST" && maximum<=8192)) {
                val failure=runCatching { Wire.decodeFromString<Failure>(data.toString(Charsets.UTF_8)) }.getOrNull()
                throw WorkspaceError(status,failure?.error ?: "Workspace request failed ($status). Saved records are kept.",failure?.current)
            }
            data
        } finally { request.disconnect() }
    }
    suspend fun login(email: String,password: String): LoginReply {
        val reply=Wire.decodeFromString<LoginReply>(send("session","POST",Wire.encodeToString(mapOf("email" to email,"password" to password)).toByteArray()).toString(Charsets.UTF_8))
        require(reply.apiVersion==1 && reply.token.matches(Regex("[a-f0-9]{64}"))) { "Unsupported workspace connection." }; return reply
    }
    suspend fun records(after: Long): SyncPage = Wire.decodeFromString(send("records?after=$after").toString(Charsets.UTF_8))
    suspend fun save(mutation: Mutation): ServerRecord = Wire.decodeFromString(send("records","POST",Wire.encodeToString(mutation).toByteArray()).toString(Charsets.UTF_8))
    suspend fun banks(): BankStatus {
        val status=Wire.decodeFromString<BankStatus>(send("banks?platform=android").toString(Charsets.UTF_8))
        return if(ProtectedTransportPolicy.requiresProtected(address))status.copy(ready=false,reason=ProtectedTransportPolicy.REPLACEMENT_REQUIRED) else status
    }
    suspend fun bankFeed(after: Long): BankFeed = Wire.decodeFromString(send("banks?after=$after").toString(Charsets.UTF_8))
    suspend fun action(path: String,values: Map<String,String>): JsonObject = Wire.parseToJsonElement(send(path,"POST",Wire.encodeToString(values).toByteArray()).toString(Charsets.UTF_8)).jsonObject
    suspend fun referrals(): JsonObject = Wire.parseToJsonElement(send("referrals").toString(Charsets.UTF_8)).jsonObject
    suspend fun profile(name:String?=null):AccountProfileReply=Wire.decodeFromString(send("profile",if(name==null) "GET" else "PATCH",
        name?.let {Wire.encodeToString(mapOf("name" to validatedDisplayName(it))).toByteArray()}).toString(Charsets.UTF_8))
    companion object {
        fun origin(raw: String): String {
            val url=URI(raw.trim()); val host=url.host?.lowercase() ?: error("Use your firm's public HTTPS workspace address.")
            require(url.scheme=="https" && url.userInfo==null && url.query==null && url.fragment==null && url.port in listOf(-1,443)
                && url.path in listOf("","/","/api/website/customer","/api/website/customer/") && host.contains('.') && !host.endsWith(".local")
                && !host.endsWith(".internal") && !host.endsWith(".localhost") && !host.matches(Regex("[0-9.]+")) && !host.contains(':')) { "Use your firm's public HTTPS workspace address or client sign-in link." }
            return "https://$host"
        }
        internal fun discoveredOrigin(bytes:ByteArray):String? {
            require(bytes.size<=32000)
            val value=Wire.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject["workspaceUrl"]
            return if(value==null || value is JsonNull) null else origin(value.jsonPrimitive.content).also {
                ProtectedTransportPolicy.requiresProtected(it)
            }
        }
        suspend fun discover(): String? = withContext(Dispatchers.IO) {
            val request=URI("https://gigtax.pro/site-config.json").toURL().openConnection() as HttpURLConnection
            try {
                request.instanceFollowRedirects=false; request.connectTimeout=15000; request.readTimeout=15000
                require(request.responseCode==200)
                val bytes=request.inputStream.use { boundedRead(it,32000) }
                discoveredOrigin(bytes)
            } finally { request.disconnect() }
        }
    }
}

fun boundedRead(input: java.io.InputStream,limit: Int): ByteArray {
    val output=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192)
    while(true) { val count=input.read(buffer); if(count<0) break; require(output.size()+count<=limit) { "The file or response is too large." }; output.write(buffer,0,count) }
    return output.toByteArray()
}
