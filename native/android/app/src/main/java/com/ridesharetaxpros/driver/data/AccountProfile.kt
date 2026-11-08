package com.ridesharetaxpros.driver.data

import kotlinx.serialization.Serializable

fun validatedDisplayName(raw:String):String=raw.trim().also {value->
    require(value.isNotEmpty() && value.codePointCount(0,value.length)<=100 && value.none {it.code in 0..31 || it.code==127}) {"Use a display name between 1 and 100 characters without control characters."}
}

@Serializable data class AccountProfileReply(val apiVersion:Int,val account:ClientAccount,val branding:WorkspaceBrand) {
    fun applyTo(expected:Connection):Connection {
        require(apiVersion==1 && account.id==expected.session.account.id) {"The workspace returned another client identity. Sign in again before continuing."}
        validatedDisplayName(account.name)
        require(account.email.isNotBlank() && account.email.length<=320) {"The workspace returned an invalid client profile."}
        return expected.copy(session=expected.session.copy(account=account,branding=branding))
    }
}

fun sameAccountReauthentication(expected:Connection,reply:LoginReply):Connection {
    require(reply.apiVersion==1 && reply.account.id==expected.session.account.id && reply.account.email.equals(expected.session.account.email,ignoreCase=true)) {"Sign-in returned a different client account. Sign out before switching accounts."}
    require(reply.token.matches(Regex("[a-f0-9]{64}"))) {"The workspace returned an unsupported session."}
    return expected.copy(session=reply)
}
