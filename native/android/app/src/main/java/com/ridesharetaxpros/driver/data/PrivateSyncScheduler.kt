package com.ridesharetaxpros.driver.data

import kotlinx.coroutines.*

/** One account-scoped queue: edits coalesce, failures retain a bounded retry loop. */
class PrivateSyncScheduler(private val jobs:CoroutineScope,private val eligible:()->Boolean,private val attempt:suspend ()->Boolean,
    private val report:(Exception)->Unit,private val initialDelay:Long=1500,private val retryDelay:Long=15000) {
    private var job:Job?=null
    private var dirty=false
    private var lastAttempt:Long?=null
    fun request() {
        if(!eligible())return
        dirty=true
        if(job?.isActive==true)return
        val scheduled=jobs.launch(start=CoroutineStart.LAZY) {
            try {
                val elapsed=lastAttempt?.let {(System.nanoTime()-it)/1_000_000} ?: retryDelay
                delay(maxOf(initialDelay,retryDelay-elapsed))
                var failures=0
                while(dirty && eligible()) {
                    dirty=false
                    lastAttempt=System.nanoTime()
                    try {if(!attempt())dirty=true;failures=0}
                    catch(error:CancellationException) {throw error}
                    catch(error:Exception) {dirty=true;failures=(failures+1).coerceAtMost(4);report(error)}
                    if(dirty && eligible())delay(retryDelay*(1L shl failures))
                }
            } finally {if(job==currentCoroutineContext()[Job])job=null}
        }
        job=scheduled;scheduled.start()
    }
    fun stop() {dirty=false;job?.cancel();job=null}
}
