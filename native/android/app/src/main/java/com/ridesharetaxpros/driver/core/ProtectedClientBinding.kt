package com.ridesharetaxpros.driver.core

import java.time.Instant
import kotlinx.serialization.Serializable

/** Local immutable account anchor. Record deletion and lost key files do not remove it. */
@Serializable data class ProtectedClientBinding(val version:Int=1,val scope:ProtectedJournalScope,val client:ProtectedRecipient,
    val highestEpoch:Int,val manifestSHA256:String) {
    fun validate(expected:ProtectedJournalScope,localClient:ProtectedRecipient) {
        require(version==1 && scope.profile==ProtectedProfile.CLIENT_ONLY && scope==expected && client==localClient && highestEpoch in 1..1_000_000_000) {
            "The saved client-only binding belongs to a different account or encryption key. Its original was kept."
        }
        protectedDecode(manifestSHA256,32)
    }
    fun approve(manifest:ProtectedManifest,pins:ProtectedPins,localClient:ProtectedRecipient,clock:Instant=Instant.now()):ProtectedClientBinding {
        validate(scope,localClient);scope.validate(pins)
        manifest.verify(pins,scope.identity,localClient,clock)
        val digest=protectedKeyID(manifest.canonicalBytes())
        require(manifest.epoch>highestEpoch || manifest.epoch==highestEpoch && digest==manifestSHA256) {
            "An older or changed enrollment cannot replace this account's highest locally verified binding."
        }
        return copy(highestEpoch=manifest.epoch,manifestSHA256=digest)
    }
    companion object {
        fun first(scope:ProtectedJournalScope,manifest:ProtectedManifest,pins:ProtectedPins,localClient:ProtectedRecipient,clock:Instant=Instant.now()):ProtectedClientBinding {
            require(scope.profile==ProtectedProfile.CLIENT_ONLY);scope.validate(pins)
            manifest.verify(pins,scope.identity,localClient,clock)
            return ProtectedClientBinding(scope=scope,client=localClient,highestEpoch=manifest.epoch,manifestSHA256=protectedKeyID(manifest.canonicalBytes()))
        }
    }
}
