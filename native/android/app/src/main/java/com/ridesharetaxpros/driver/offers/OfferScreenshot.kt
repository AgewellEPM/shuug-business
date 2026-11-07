package com.ridesharetaxpros.driver.offers

import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.ridesharetaxpros.driver.data.*
import kotlinx.coroutines.*
import java.io.ByteArrayInputStream

object OfferScreenshot {
    fun read(repo: DriverRepository,uri: Uri) {
        repo.requestedOfferReader=true
        val scope=repo.scope;val session=repo.journal.offerReader.id
        repo.run {
            require(uri.scheme=="content") {"Choose an image through Android’s file or sharing picker."}
            require(repo.journal.offerReader.active()) {"Enable offer reading for this shift, then share the screenshot again."}
            repo.offerReaderStatus="Reading the chosen screenshot on this phone…"
            val (bitmap,rotation)=withContext(Dispatchers.IO) {
                val bytes=repo.app.contentResolver.openInputStream(uri)!!.use {boundedRead(it,20*1024*1024)}
                val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                require(bounds.outWidth>0 && bounds.outHeight>0 && bounds.outWidth.toLong()*bounds.outHeight<=30_000_000) {"Choose a readable offer screenshot."}
                var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>1600) sample*=2
                val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply {inSampleSize=sample}) ?: error("The screenshot could not be read.")
                val orientation=runCatching {ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}.getOrDefault(1)
                val rotation=when(orientation) {ExifInterface.ORIENTATION_ROTATE_90->90;ExifInterface.ORIENTATION_ROTATE_180->180;ExifInterface.ORIENTATION_ROTATE_270->270;else->0}
                bitmap to rotation
            }
            if(repo.scope!=scope || repo.journal.offerReader.id!=session) {bitmap.recycle();return@run}
            val scanner=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            scanner.process(InputImage.fromBitmap(bitmap,rotation)).addOnSuccessListener {result->
                try {OfferAlerts.ingest(repo,result.text,"sharedScreenshot",scope,session);repo.offerReaderStatus="Screenshot read. Review extracted details and current offer availability."}
                catch(error: Exception) {repo.failure=error.message}
            }.addOnFailureListener {repo.offerReaderStatus="Could not read this screenshot. Enter the offer manually."}
                .addOnCompleteListener {bitmap.recycle();scanner.close()}
        }
    }
}
