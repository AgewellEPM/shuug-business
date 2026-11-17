package com.ridesharetaxpros.driver.core

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.bouncycastle.crypto.AsymmetricCipherKeyPair

@Serializable data class ProtectedReceiptCheckpoint(val version:Int=1,val scope:ProtectedJournalScope,val receiptId:String,val objectId:String=uuid(),
    val fingerprint:String,val mutationId:String=uuid(),val envelope:ProtectedEnvelope,val acknowledgment:ProtectedObjectReceipt?=null) {
    fun validate(expected:ProtectedJournalScope,id:String) {
        require(version==1 && scope==expected && receiptId==id);protectedSnapshotID(id);protectedSnapshotID(objectId);protectedSnapshotID(mutationId);protectedDecode(fingerprint,32)
        require(envelope.version==(if(scope.profile==ProtectedProfile.CLIENT_ONLY) 3 else 2) && envelope.profile==scope.profile && envelope.context==ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,objectId,1,"driver-receipt"))
        acknowledgment?.let {it.validate();require(it.objectId==objectId && it.revision==1 && !it.deleted)}
    }
    fun acknowledged(value:ProtectedObjectReceipt):ProtectedReceiptCheckpoint=copy(acknowledgment=value).also {it.validate(scope,receiptId)}
    companion object {
        fun fingerprint(receipt:LocalReceipt,bytes:ByteArray):String=protectedKeyID(receipt.mime.toByteArray(Charsets.UTF_8)+byteArrayOf(0)+bytes)
        fun prepare(scope:ProtectedJournalScope,receipt:LocalReceipt,bytes:ByteArray,trusted:ProtectedEnvelope.Trusted,key:AsymmetricCipherKeyPair):ProtectedReceiptCheckpoint {
            require(scope.profile==trusted.profile);protectedSnapshotID(receipt.id);require(bytes.size in 1..5*1024*1024)
            val extension=when(receipt.mime) {
                "application/pdf"->{require(bytes.size>=5 && bytes.copyOfRange(0,5).toString(Charsets.US_ASCII)=="%PDF-");"pdf"}
                "image/jpeg"->{require(bytes.size>=3 && bytes[0]==(-1).toByte() && bytes[1]==(-40).toByte() && bytes[2]==(-1).toByte());"jpg"}
                "image/png"->{require(bytes.size>=8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(-119,80,78,71,13,10,26,10)));"png"}
                else->error("Use a PDF, JPEG or PNG receipt.")
            }
            val objectId=uuid()
            val payload=buildJsonObject {
                put("version",1);put("type","private-file");put("filename","receipt-${receipt.id}.$extension");put("mime",receipt.mime)
                put("data",protectedEncode(bytes));put("byteLength",bytes.size);put("purpose","receipt");put("category","purchases");put("notes","");put("savedAt",Instant.now().toString())
            }.toString().toByteArray(Charsets.UTF_8)
            val envelope=try {ProtectedEnvelope.seal(payload,ProtectedEnvelope.Context(scope.workspaceId,scope.identity.accountId,objectId,1,"driver-receipt"),trusted,"client",key)} finally {payload.fill(0)}
            return ProtectedReceiptCheckpoint(scope=scope,receiptId=receipt.id,objectId=objectId,fingerprint=fingerprint(receipt,bytes),envelope=envelope).also {it.validate(scope,receipt.id)}
        }
    }
}
