package com.ridesharetaxpros.driver.ui

import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.ridesharetaxpros.driver.core.*
import com.ridesharetaxpros.driver.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.time.Instant
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable fun PrivateSocialSignIn(repo:DriverRepository,pins:ProtectedPins,blocked:Boolean,manage:Boolean=false,onChallenge:(PrivateMfaChallenge)->Unit) {
    val expected=repo.connection
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val jobs=rememberCoroutineScope()
    var providers by remember(expected?.session?.token) {mutableStateOf<Map<String,Boolean>>(emptyMap())}
    var linked by remember(expected?.session?.token) {mutableStateOf<Set<String>>(emptySet())}
    var busy by remember {mutableStateOf(false)};var message by remember {mutableStateOf<String?>(null)}
    LaunchedEffect(expected?.session?.token) {
        try {val client=PrivateSocialClient(pins,expected);providers=client.providers();if(manage&&expected!=null)linked=client.connections()}
        catch(error:CancellationException){throw error}catch(_:Exception){providers=emptyMap()}
    }
    if(providers.values.any {it}) {
        Text(if(!manage)"Sign in with an account you connected earlier." else "Connected sign-in methods",color=Muted)
        for(provider in listOf("google","apple").filter {providers[it]==true}) {
            val name=if(provider=="google")"Google" else "Apple"
            Action(if(!manage)"Continue with $name" else if(provider in linked)"Disconnect $name" else "Connect $name",{
                if(!busy){busy=true;jobs.launch {try {
                    val client=PrivateSocialClient(pins,expected)
                    require(repo.connection==expected) {"Your account changed. Reopen sign-in."}
                    if(manage&&expected!=null&&provider in linked) {client.unlink(provider);linked=client.connections();message="$name sign-in disconnected."}
                    else {
                        val flow=client.begin(provider,manage);require(repo.connection==expected)
                        openPublicLink(repo,flow.reply.authorizationUrl);message="Complete $name sign-in, then return to this app."
                        while(Instant.now()<Instant.parse(flow.reply.expiresAt)) {
                            delay(1500);require(repo.connection==expected) {"Your account changed. Start again."}
                            if(!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))continue
                            val result=client.result(flow);require(repo.connection==expected)
                            if(result["pending"]?.jsonPrimitive?.booleanOrNull==true)continue
                            if(flow.link){require(result["linked"]?.jsonPrimitive?.booleanOrNull==true);linked=client.connections();message="$name sign-in connected."}
                            else {require(result["audience"]?.jsonPrimitive?.content=="secure-customer");val challenge=Wire.decodeFromJsonElement<PrivateMfaChallenge>(result);challenge.validate();onChallenge(challenge);message="$name identity verified. Complete the authenticator check."}
                            return@launch
                        }
                        error("Provider sign-in expired. Start again.")
                    }
                }catch(error:CancellationException){throw error}catch(error:Exception){message=error.message}finally{busy=false}}}
            },false,!blocked&&!busy)
        }
        if(busy)CircularProgressIndicator(color=Pink)
        message?.let {Text(it,color=Link)}
    }
}
