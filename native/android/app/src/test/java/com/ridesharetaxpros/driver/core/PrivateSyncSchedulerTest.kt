package com.ridesharetaxpros.driver.core

import com.ridesharetaxpros.driver.data.PrivateSyncScheduler
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class PrivateSyncSchedulerTest {
    @Test fun editsDuringUploadAndAFailedRequestRetryWithoutConcurrentAttempts()=runBlocking {
        var calls=0;var active=0;var maximum=0;var errors=0;var eligible=true
        val entered=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val complete=CompletableDeferred<Unit>()
        val scheduler=PrivateSyncScheduler(this,{eligible},{
            active++;maximum=maxOf(maximum,active);calls++
            try {when(calls) {1->{entered.complete(Unit);release.await();throw IllegalStateException("synthetic offline")};else->{complete.complete(Unit);true}}}finally{active--}
        },{errors++},initialDelay=1,retryDelay=2)
        try {
            repeat(20){scheduler.request()}
            withTimeout(3000){entered.await()};scheduler.request();release.complete(Unit)
            withTimeout(3000){complete.await()};delay(20)
            assertEquals(2,calls);assertEquals(1,maximum);assertEquals(1,errors)
            eligible=false;scheduler.request();delay(20);assertEquals(2,calls)
        } finally {scheduler.stop()}
    }
    @Test fun stopAndNewAccountCannotBeClearedByAnOldCancelledJob()=runBlocking {
        var calls=0;val entered=CompletableDeferred<Unit>();val final=CompletableDeferred<Unit>()
        val scheduler=PrivateSyncScheduler(this,{true},{calls++;if(calls==1){entered.complete(Unit);awaitCancellation()}else{final.complete(Unit);true}},{},initialDelay=1,retryDelay=2)
        try {scheduler.request();withTimeout(3000){entered.await()};scheduler.stop();scheduler.request();withTimeout(3000){final.await()};assertEquals(2,calls)}finally{scheduler.stop()}
    }
}
