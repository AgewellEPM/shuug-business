package com.ridesharetaxpros.driver.data

import com.ridesharetaxpros.driver.core.*
import java.net.URI
import java.security.SecureRandom
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class PrivateSocialStart(val apiVersion:Int,val requestId:String,val authorizationUrl:String,val expiresAt:String)
data class PrivateSocialFlow(val reply:PrivateSocialStart,val verifier:String,val link:Boolean)
class PrivateSocialClient(private val pins:ProtectedPins,connection:Connection?=null) {
    private val client=WorkspaceClient(connection,pins.workspaceOrigin)
    init {pins.validate();require(connection==null||connection.access==AccountAccess.PRIVATE&&connection.origin==pins.workspaceOrigin)}
    suspend fun providers():Map<String,Boolean> {
        val raw=Wire.parseToJsonElement(client.customer("secure/social/config",maximum=8192).toString(Charsets.UTF_8)).jsonObject
        require(raw["apiVersion"]?.jsonPrimitive?.intOrNull==1)
        return listOf("google","apple").associateWith {raw["providers"]!!.jsonObject[it]!!.jsonPrimitive.boolean}
    }
    suspend fun connections():Set<String> {
        val raw=post("connections",buildJsonObject {put("audience","secure-customer")})
        require(raw["apiVersion"]?.jsonPrimitive?.intOrNull==1)
        return raw["providers"]!!.jsonArray.map {it.jsonPrimitive.content.also {value->require(value in listOf("google","apple"))}}.toSet()
    }
    suspend fun unlink(provider:String) {
        require(provider in listOf("google","apple"))
        val raw=post("unlink",buildJsonObject {put("provider",provider);put("audience","secure-customer")})
        require(raw["apiVersion"]?.jsonPrimitive?.intOrNull==1&&raw["disconnected"]?.jsonPrimitive?.boolean==true&&raw["provider"]?.jsonPrimitive?.content==provider)
    }
    suspend fun begin(provider:String,link:Boolean):PrivateSocialFlow {
        require(provider in listOf("google","apple"));val bytes=ByteArray(32).also {SecureRandom().nextBytes(it)}
        val verifier=protectedEncode(bytes);bytes.fill(0)
        val raw=post("start",buildJsonObject {put("provider",provider);put("audience","secure-customer");put("purpose",if(link)"link" else "login");put("challenge",protectedKeyID(verifier.toByteArray(Charsets.UTF_8)))})
        val reply=Wire.decodeFromJsonElement<PrivateSocialStart>(raw)
        require(reply.apiVersion==1);protectedSnapshotID(reply.requestId)
        require(Instant.parse(reply.expiresAt)>Instant.now()&&Instant.parse(reply.expiresAt)<Instant.now().plusSeconds(660))
        require(PrivateSocialAuthorization.allowed(reply.authorizationUrl,provider,pins.workspaceOrigin)) {"The provider address or requested permissions were not verified."}
        return PrivateSocialFlow(reply,verifier,link)
    }
    suspend fun result(flow:PrivateSocialFlow):JsonObject {
        require(Instant.parse(flow.reply.expiresAt)>Instant.now()) {"Provider sign-in expired. Start again."}
        return post("result",buildJsonObject {put("requestId",flow.reply.requestId);put("verifier",flow.verifier)})
    }
    private suspend fun post(path:String,body:JsonObject):JsonObject = Wire.parseToJsonElement(client.customer("secure/social/$path","POST",body.toString().toByteArray(Charsets.UTF_8),maximum=8192).toString(Charsets.UTF_8)).jsonObject
}
