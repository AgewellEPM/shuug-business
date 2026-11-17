package com.ridesharetaxpros.driver.data

import com.ridesharetaxpros.driver.core.*
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class PrivateMfaChallenge(val apiVersion:Int,val mfaRequired:Boolean,val challengeToken:String,val enrollmentRequired:Boolean,val expiresAt:String,val secret:String?=null) {
    fun validate() {
        require(apiVersion==1 && mfaRequired && challengeToken.matches(Regex("[a-f0-9]{64}")) && Instant.parse(expiresAt)>Instant.now() && Instant.parse(expiresAt)<Instant.now().plusSeconds(360)) {"Sign-in verification is invalid or expired."}
        require(!enrollmentRequired || secret?.matches(Regex("[A-Z2-7]{32}"))==true)
    }
}
@Serializable data class PrivateAccountSession(val apiVersion:Int,val token:String,val expiresAt:String,val identity:ProtectedIdentity,val recoveryCodes:List<String> = emptyList()) {
    fun connection(pins:ProtectedPins):Connection {
        pins.validate();require(apiVersion==1 && token.matches(Regex("[a-f0-9]{64}")) && Instant.parse(expiresAt)>Instant.now())
        protectedSnapshotID(identity.accountId);protectedSnapshotID(identity.clientId)
        require(recoveryCodes.size<=10 && recoveryCodes.all {it.matches(Regex("[A-F0-9]{6}(-[A-F0-9]{6}){3}"))})
        return Connection(pins.workspaceOrigin,LoginReply(1,token,expiresAt,ClientAccount(identity.accountId,"Private client",""),WorkspaceBrand("Gig Tax Pros","#21152d","#d362ee")),AccountAccess.PRIVATE,identity.clientId,pins.profile)
    }
}
class PrivateAccountClient(val pins:ProtectedPins) {
    init {pins.validate()}
    private val client=WorkspaceClient(address=pins.workspaceOrigin)
    suspend fun begin(accountCode:String,password:String):PrivateMfaChallenge {
        protectedSnapshotID(accountCode);require(password.isNotEmpty() && password.length<=200)
        val body=buildJsonObject {put("accountCode",accountCode);put("password",password)}.toString().toByteArray(Charsets.UTF_8)
        val result=try {client.customer("${pins.apiPrefix}/native-session","POST",body,maximum=8192,allowMfaChallenge=true)} finally {body.fill(0)}
        return Wire.decodeFromString<PrivateMfaChallenge>(result.toString(Charsets.UTF_8)).also {it.validate()}
    }
    suspend fun complete(challenge:PrivateMfaChallenge,code:String):PrivateAccountSession {
        challenge.validate();require(code.trim().length in 1..40)
        val body=buildJsonObject {put("challengeToken",challenge.challengeToken);put("code",code.trim());put("privateAccount",true)}.toString().toByteArray(Charsets.UTF_8)
        val result=try {client.customer("${pins.apiPrefix}/native-session","POST",body,maximum=8192)} finally {body.fill(0)}
        return Wire.decodeFromString<PrivateAccountSession>(result.toString(Charsets.UTF_8)).also {it.connection(pins)}
    }
}
