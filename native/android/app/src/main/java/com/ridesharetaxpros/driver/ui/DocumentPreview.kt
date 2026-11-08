package com.ridesharetaxpros.driver.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.ridesharetaxpros.driver.data.DriverRepository
import java.io.ByteArrayInputStream
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.min
import kotlin.math.roundToInt

data class DocumentPreviewData(val name:String,val bytes:ByteArray,val mime:String)
const val MAX_NATIVE_DOCUMENT_BYTES=10*1024*1024
fun validatedDocumentMime(bytes:ByteArray,expectedMime:String?=null):String {
    require(bytes.size in 1..MAX_NATIVE_DOCUMENT_BYTES) { "Choose a document between 1 byte and 10 MB." }
    val actual=when {
        bytes.size>=5 && bytes[0]==0x25.toByte() && bytes[1]==0x50.toByte() && bytes[2]==0x44.toByte() && bytes[3]==0x46.toByte() && bytes[4]==0x2d.toByte()->"application/pdf"
        bytes.size>=3 && bytes[0]==0xff.toByte() && bytes[1]==0xd8.toByte() && bytes[2]==0xff.toByte()->"image/jpeg"
        bytes.size>=8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))->"image/png"
        else->error("Choose a PDF, JPEG or PNG document.")
    }
    require(expectedMime==null || expectedMime==actual) { "The document contents do not match its saved file type." }
    return actual
}
private data class DocumentFrame(val bitmap:Bitmap,val pageCount:Int=1)
private fun previewIdentity(repo:DriverRepository)=repo.scope+"|"+(repo.connection?.let { it.origin+"|"+it.session.account.id+"|"+it.session.token } ?: "guest")
private suspend fun documentFrame(repo:DriverRepository,document:DocumentPreviewData,pageNumber:Int):DocumentFrame=withContext(Dispatchers.IO) {
    val mime=validatedDocumentMime(document.bytes,document.mime)
    if(mime=="application/pdf") {
        // PdfRenderer needs a seekable descriptor. This app-private transient file
        // has no provider URI, never enters backup, and is removed on every exit.
        val file=File.createTempFile("private-document-",".pdf",repo.app.cacheDir)
        try {
            file.outputStream().use { it.write(document.bytes) };ensureActive()
            ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor->
                require(file.delete()) { "The private PDF preview could not be prepared securely. You can save an unchanged copy instead." }
                PdfRenderer(descriptor).use { renderer->
                    require(renderer.pageCount in 1..10000) { "This PDF has no supported preview pages. You can save an unchanged copy to inspect separately." }
                    renderer.openPage(pageNumber.coerceIn(0,renderer.pageCount-1)).use { page->
                        require(page.width>0 && page.height>0)
                        val scale=min(1800.0/page.width,1800.0/page.height).coerceAtMost(3.0)
                        val bitmap=Bitmap.createBitmap((page.width*scale).roundToInt().coerceAtLeast(1),(page.height*scale).roundToInt().coerceAtLeast(1),Bitmap.Config.ARGB_8888)
                        try { bitmap.eraseColor(android.graphics.Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);ensureActive();DocumentFrame(bitmap,renderer.pageCount) }
                        catch(failure:Throwable) { bitmap.recycle();throw failure }
                    }
                }
            }
        } finally { file.delete() }
    } else {
        val options=BitmapFactory.Options().apply { inJustDecodeBounds=true }
        BitmapFactory.decodeByteArray(document.bytes,0,document.bytes.size,options)
        require(options.outWidth in 1..100000 && options.outHeight in 1..100000) { "This image could not be previewed. You can save an unchanged copy to inspect separately." }
        var sample=1
        while(options.outWidth/sample>1800 || options.outHeight/sample>1800) sample*=2
        options.inJustDecodeBounds=false;options.inSampleSize=sample;options.inPreferredConfig=Bitmap.Config.ARGB_8888
        val bitmap=BitmapFactory.decodeByteArray(document.bytes,0,document.bytes.size,options) ?: error("This image could not be previewed. You can save an unchanged copy to inspect separately.")
        try {
            val orientation=runCatching { ByteArrayInputStream(document.bytes).use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL) } }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
            val matrix=Matrix().apply { when(orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL->setScale(-1f,1f)
                ExifInterface.ORIENTATION_ROTATE_180->setRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL->setScale(1f,-1f)
                ExifInterface.ORIENTATION_TRANSPOSE->{ setRotate(90f);postScale(-1f,1f) }
                ExifInterface.ORIENTATION_ROTATE_90->setRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE->{ setRotate(270f);postScale(-1f,1f) }
                ExifInterface.ORIENTATION_ROTATE_270->setRotate(270f)
            } }
            val transformed=if(matrix.isIdentity) bitmap else Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true).also { if(it!==bitmap) bitmap.recycle() }
            try { ensureActive();DocumentFrame(transformed) } catch(failure:Throwable) { transformed.recycle();throw failure }
        } catch(failure:Throwable) { if(!bitmap.isRecycled) bitmap.recycle();throw failure }
    }
}

/** Private native preview. Save a copy writes original bytes only after explicit selection. */
@Composable fun NativeDocumentPreview(repo:DriverRepository,document:DocumentPreviewData,close:()->Unit) {
    val identity=remember(document) { previewIdentity(repo) }
    val jobs=rememberCoroutineScope()
    var page by remember(document) { mutableStateOf(0) };var frame by remember(document) { mutableStateOf<DocumentFrame?>(null) }
    var loading by remember(document) { mutableStateOf(false) };var saving by remember(document) { mutableStateOf(false) }
    var error by remember(document) { mutableStateOf<String?>(null) };var notice by remember(document) { mutableStateOf<String?>(null) }
    var zoom by remember(document,page) { mutableStateOf(1f) };var offset by remember(document,page) { mutableStateOf(Offset.Zero) }
    val valid=remember(document) { runCatching { validatedDocumentMime(document.bytes,document.mime) }.isSuccess }
    fun requireCurrent() { require(identity==previewIdentity(repo)) { "Your account changed. Reopen this document before saving." } }
    val exporter=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(document.mime)) { uri->
        if(uri!=null) jobs.launch {
            saving=true;error=null
            try {
                requireCurrent();validatedDocumentMime(document.bytes,document.mime)
                withContext(Dispatchers.IO) {
                    requireCurrent();repo.app.contentResolver.openOutputStream(uri,"wt")?.use { stream->
                        var start=0
                        while(start<document.bytes.size) { ensureActive();requireCurrent();val length=minOf(65536,document.bytes.size-start);stream.write(document.bytes,start,length);start+=length }
                        stream.flush();ensureActive();requireCurrent()
                    } ?: error("The selected location could not save this copy.")
                }
                if(identity==previewIdentity(repo)) notice="An unchanged copy was saved to your chosen location."
            } catch(failure:Exception) {
                // CreateDocument makes a new user-selected file. Remove only that
                // incomplete export if writing/cancellation failed.
                runCatching { DocumentsContract.deleteDocument(repo.app.contentResolver,uri) }
                if(failure is CancellationException) throw failure
                if(identity==previewIdentity(repo)) error=failure.message ?: "The copy could not be saved. Your original is kept."
            } finally { saving=false }
        }
    }
    LaunchedEffect(document,page) {
        loading=true;error=null
        try { requireCurrent();val next=documentFrame(repo,document,page);requireCurrent();frame=next }
        catch(failure:Exception) { if(failure is CancellationException) throw failure;error=failure.message ?: "This document could not be previewed. You can save its unchanged bytes.";frame=null }
        finally { loading=false }
    }
    LaunchedEffect(previewIdentity(repo)) { if(identity!=previewIdentity(repo)) close() }
    if(identity!=previewIdentity(repo)) return
    Dialog(onDismissRequest={if(!saving) close()},properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)) {
        Surface(Modifier.fillMaxSize(),color=Ink) {
            Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal=12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick=close,enabled=!saving) { Text("Done",color=Link) }
                    Text(document.name,Modifier.weight(1f),maxLines=1,overflow=TextOverflow.Ellipsis,style=MaterialTheme.typography.titleMedium)
                    TextButton(enabled=valid && !saving,onClick={error=null;exporter.launch(document.name.replace(Regex("[\\p{Cntrl}\\\\/]"),"_").take(160).ifBlank { "Document" })}) { Text(if(saving) "Saving…" else "Save a copy",color=Link) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().clipToBounds().background(Color(0xFF13151A)),contentAlignment=Alignment.Center) {
                    frame?.let { rendered->
                        Image(rendered.bitmap.asImageBitmap(),contentDescription=document.name+(if(document.mime=="application/pdf") ", page ${page+1} of ${rendered.pageCount}" else ""),contentScale=ContentScale.Fit,
                            modifier=Modifier.fillMaxSize().pointerInput(document,page) { detectTransformGestures { _,pan,scale,_->
                                zoom=(zoom*scale).coerceIn(1f,4f)
                                offset=if(zoom==1f) Offset.Zero else Offset((offset.x+pan.x).coerceIn(-size.width*(zoom-1)/2,size.width*(zoom-1)/2),(offset.y+pan.y).coerceIn(-size.height*(zoom-1)/2,size.height*(zoom-1)/2))
                            } }.graphicsLayer { scaleX=zoom;scaleY=zoom;translationX=offset.x;translationY=offset.y;clip=true })
                    }
                    if(loading) CircularProgressIndicator(color=Link)
                    if(frame==null && !loading) Text(error ?: "No preview available.",Modifier.padding(18.dp),color=Muted)
                }
                frame?.let { rendered->
                    if(document.mime=="application/pdf") Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                        TextButton(enabled=page>0 && !loading,onClick={page--}) { Text("Previous") };Text("Page ${page+1} of ${rendered.pageCount}",color=Muted)
                        TextButton(enabled=page<rendered.pageCount-1 && !loading,onClick={page++}) { Text("Next") }
                    }
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center) {
                        TextButton(enabled=zoom>1,onClick={zoom=(zoom-.5f).coerceAtLeast(1f);offset=Offset.Zero}) { Text("Zoom out") }
                        TextButton(onClick={zoom=1f;offset=Offset.Zero}) { Text("Reset") }
                        TextButton(enabled=zoom<4,onClick={zoom=(zoom+.5f).coerceAtMost(4f)}) { Text("Zoom in") }
                    }
                }
                Text("Preview stays inside this app. A copy is saved only if you choose Save a copy.",color=Muted,style=MaterialTheme.typography.bodySmall)
                if(frame!=null) error?.let { Text(it,color=Caution,style=MaterialTheme.typography.bodySmall) }
                notice?.let { Text(it,color=Income,style=MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}
