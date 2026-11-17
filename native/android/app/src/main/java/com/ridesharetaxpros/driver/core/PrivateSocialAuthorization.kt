package com.ridesharetaxpros.driver.core

import java.net.URI
import java.net.URLDecoder

object PrivateSocialAuthorization {
    fun allowed(raw:String,provider:String,origin:String):Boolean=runCatching {
        require(raw.length<=8192&&provider in setOf("google","apple"))
        val uri=URI(raw);val google=provider=="google"
        require(uri.scheme=="https"&&uri.host==(if(google)"accounts.google.com" else "appleid.apple.com")&&uri.port==-1&&uri.rawUserInfo==null&&uri.rawFragment==null&&uri.path==(if(google)"/o/oauth2/v2/auth" else "/auth/authorize"))
        val pairs=uri.rawQuery.split('&').map {part->val parts=part.split('=',limit=2);require(parts.size==2);URLDecoder.decode(parts[0],"UTF-8") to URLDecoder.decode(parts[1],"UTF-8")}
        val params=pairs.toMap();require(params.size==pairs.size)
        val keys=setOf("client_id","redirect_uri","response_type","state","nonce")+if(google)setOf("scope","code_challenge","code_challenge_method","prompt") else setOf("response_mode")
        require(params.keys==keys&&params["client_id"]!!.matches(Regex("[A-Za-z0-9._-]{1,255}"))&&params["redirect_uri"]=="$origin/api/auth/social/$provider/callback"&&params["response_type"]=="code")
        require(listOf("state","nonce").all {params[it]!!.matches(Regex("[A-Za-z0-9_-]{43}"))})
        if(google)require(params["scope"]=="openid"&&params["code_challenge_method"]=="S256"&&params["code_challenge"]!!.matches(Regex("[A-Za-z0-9_-]{43}"))&&params["prompt"]=="select_account")
        else require(params["response_mode"]=="query")
        true
    }.getOrDefault(false)
}
