package com.ridesharetaxpros.driver.core

import java.net.URLEncoder
import org.junit.Assert.*
import org.junit.Test

class PrivateSocialAuthorizationTest {
    private val origin="https://workspace.example.com"
    private fun url(provider:String="google",changes:Map<String,String> = emptyMap()):String {
        val google=provider=="google"
        val values=linkedMapOf("client_id" to "synthetic.apps.googleusercontent.com","redirect_uri" to "$origin/api/auth/social/$provider/callback","response_type" to "code","state" to "s".repeat(43),"nonce" to "n".repeat(43))
        if(google)values.putAll(mapOf("scope" to "openid","code_challenge" to "c".repeat(43),"code_challenge_method" to "S256","prompt" to "select_account"))else values["response_mode"]="query"
        values.putAll(changes)
        return (if(google)"https://accounts.google.com/o/oauth2/v2/auth" else "https://appleid.apple.com/auth/authorize")+"?"+values.entries.joinToString("&") {URLEncoder.encode(it.key,"UTF-8")+"="+URLEncoder.encode(it.value,"UTF-8")}
    }
    @Test fun acceptsOnlyThePinnedCallbackAndMinimalProviderIdentityRequest() {
        assertTrue(PrivateSocialAuthorization.allowed(url(),"google",origin));assertTrue(PrivateSocialAuthorization.allowed(url("apple"),"apple",origin))
        for(value in listOf(url(changes=mapOf("scope" to "openid https://www.googleapis.com/auth/drive")),url(changes=mapOf("redirect_uri" to "https://foreign.example/callback")),url(changes=mapOf("nonce" to "short")),url().replace("accounts.google.com","foreign.example"),url()+"&scope=openid",url(changes=mapOf("response_type" to "token"))))assertFalse(PrivateSocialAuthorization.allowed(value,"google",origin))
    }
    @Test fun protectedTransportCannotUseSocialEndpointsToUploadRecordsOrChooseAnOwnerAudience() {
        val good="""{"provider":"google","audience":"secure-customer","purpose":"login","challenge":"${"c".repeat(43)}"}"""
        ProtectedTransportPolicy.assertAllowed(true,"secure/social/start","POST",good.toByteArray())
        for(value in listOf(good.replace("secure-customer","owner"),good.dropLast(1)+",\"journal\":{}}",good.replace("google","unknown")))assertThrows(Exception::class.java) {ProtectedTransportPolicy.assertAllowed(true,"secure/social/start","POST",value.toByteArray())}
        assertThrows(Exception::class.java) {ProtectedTransportPolicy.assertAllowed(true,"secure/social/account","POST",good.toByteArray())}
    }
}
