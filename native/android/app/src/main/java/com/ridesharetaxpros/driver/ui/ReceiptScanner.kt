package com.ridesharetaxpros.driver.ui

import android.content.Context
import android.content.ContextWrapper
import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.os.ParcelFileDescriptor
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.ridesharetaxpros.driver.core.uuid
import com.ridesharetaxpros.driver.data.DriverRepository
import com.ridesharetaxpros.driver.data.boundedRead
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.min
import kotlin.math.roundToInt

const val MAX_RECEIPT_BYTES=5*1024*1024
private const val MAX_CAMERA_BYTES=32*1024*1024
data class ReceiptCapture(val bytes:ByteArray,val mime:String)
fun receiptScope(repo:DriverRepository)=repo.scope+"|"+(repo.connection?.session?.token ?: "guest")

/** Bounds the decoded pixels before allocating; EXIF orientation is applied locally. */
private fun sampledReceiptImage(bytes:ByteArray,edge:Int=1800):Bitmap {
    val options=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)
    require(options.outWidth in 1..100000 && options.outHeight in 1..100000) {"This receipt image cannot be opened."}
    var sample=1;while((options.outWidth+sample-1)/sample>edge || (options.outHeight+sample-1)/sample>edge)sample*=2
    val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply {inSampleSize=sample;inPreferredConfig=Bitmap.Config.ARGB_8888}) ?: error("This receipt image cannot be opened.")
    try {
        val orientation=runCatching {ByteArrayInputStream(bytes).use {ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}}.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix=Matrix().apply {when(orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL->setScale(-1f,1f)
            ExifInterface.ORIENTATION_ROTATE_180->setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL->setScale(1f,-1f)
            ExifInterface.ORIENTATION_TRANSPOSE->{setRotate(90f);postScale(-1f,1f)}
            ExifInterface.ORIENTATION_ROTATE_90->setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE->{setRotate(270f);postScale(-1f,1f)}
            ExifInterface.ORIENTATION_ROTATE_270->setRotate(270f)
        }}
        return if(matrix.isIdentity)bitmap else Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true).also {if(it!==bitmap)bitmap.recycle()}
    } catch(failure:Throwable) {bitmap.recycle();throw failure}
}
suspend fun receiptRecognitionBitmap(context:Context,bytes:ByteArray,mime:String):Bitmap=withContext(Dispatchers.IO) {
    require(bytes.size in 1..MAX_RECEIPT_BYTES);validatedDocumentMime(bytes,mime)
    if(mime!="application/pdf") {
        val bitmap=sampledReceiptImage(bytes)
        try {ensureActive();bitmap} catch(failure:Throwable) {bitmap.recycle();throw failure}
    } else {
        val temporary=File.createTempFile("receipt-ocr-",".pdf",context.cacheDir)
        try {
            temporary.outputStream().use {it.write(bytes)};ensureActive()
            ParcelFileDescriptor.open(temporary,ParcelFileDescriptor.MODE_READ_ONLY).use {descriptor->
                require(temporary.delete()) {"The private PDF could not be prepared for local recognition."}
                PdfRenderer(descriptor).use {renderer->
                    require(renderer.pageCount>0) {"This receipt PDF has no pages."}
                    renderer.openPage(0).use {page->
                        require(page.width>0 && page.height>0)
                        val scale=min(1800.0/page.width,1800.0/page.height).coerceAtMost(3.0)
                        val bitmap=Bitmap.createBitmap((page.width*scale).roundToInt().coerceAtLeast(1),(page.height*scale).roundToInt().coerceAtLeast(1),Bitmap.Config.ARGB_8888)
                        try {bitmap.eraseColor(android.graphics.Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);ensureActive();bitmap}
                        catch(failure:Throwable) {bitmap.recycle();throw failure}
                    }
                }
            }
        } finally {temporary.delete()}
    }
}
suspend fun normalizeReceipt(bytes:ByteArray,declaredMime:String?):ReceiptCapture=withContext(Dispatchers.IO) {
    require(bytes.isNotEmpty() && bytes.size<=MAX_CAMERA_BYTES) {"This receipt exceeds the capture size limit."}
    val pdf=bytes.size>=5 && bytes.copyOfRange(0,5).toString(Charsets.US_ASCII)=="%PDF-"
    if(pdf) {
        require(bytes.size<=MAX_RECEIPT_BYTES);validatedDocumentMime(bytes,declaredMime?.takeIf {it!="application/octet-stream"})
        ReceiptCapture(bytes,"application/pdf")
    } else {
        require(declaredMime==null || declaredMime in setOf("image/jpeg","image/png","application/octet-stream")) {"Choose a JPEG, PNG or PDF receipt."}
        val prefix=bytes.take(8).toByteArray();val header=when {
            prefix.size>=3 && prefix[0]==0xff.toByte() && prefix[1]==0xd8.toByte() && prefix[2]==0xff.toByte()->"image/jpeg"
            prefix.contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))->"image/png"
            else->error("Choose a JPEG, PNG or PDF receipt.")
        }
        require(declaredMime==null || declaredMime=="application/octet-stream" || declaredMime==header) {"The receipt's contents do not match its file type."}
        val bitmap=sampledReceiptImage(bytes)
        try {
            ensureActive();val output=ByteArrayOutputStream();require(bitmap.compress(Bitmap.CompressFormat.JPEG,76,output))
            val jpeg=output.toByteArray();require(jpeg.size<=MAX_RECEIPT_BYTES) {"This receipt exceeds 5 MB. Use a closer single-page scan."};ReceiptCapture(jpeg,"image/jpeg")
        } finally {bitmap.recycle()}
    }
}
suspend fun recognizeReceipt(context:Context,bytes:ByteArray,mime:String):String {
    val bitmap=receiptRecognitionBitmap(context,bytes,mime)
    return suspendCancellableCoroutine {continuation->
        val reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            reader.process(InputImage.fromBitmap(bitmap,0)).addOnCompleteListener {task->
                try {
                    if(continuation.isActive) {
                        if(task.isSuccessful) continuation.resume(task.result.text)
                        else continuation.resumeWithException(task.exception ?: IllegalStateException("Receipt recognition could not finish."))
                    }
                } finally {reader.close();bitmap.recycle()}
            }
        } catch(failure:Exception) {reader.close();bitmap.recycle();if(continuation.isActive)continuation.resumeWithException(failure)}
    }
}
private class ReceiptTooLarge:Exception()
private class ReceiptOutput:OutputStream() {
    private val bytes=ByteArrayOutputStream()
    override fun write(value:Int) {if(bytes.size()>=MAX_RECEIPT_BYTES)throw ReceiptTooLarge();bytes.write(value)}
    override fun write(buffer:ByteArray,offset:Int,length:Int) {if(bytes.size().toLong()+length>MAX_RECEIPT_BYTES)throw ReceiptTooLarge();bytes.write(buffer,offset,length)}
    fun result()=bytes.toByteArray()
}
private suspend fun scannedReceipt(files:List<File>):ReceiptCapture=withContext(Dispatchers.IO) {
    require(files.size in 1..12)
    if(files.size==1) return@withContext normalizeReceipt(files[0].inputStream().use {boundedRead(it,MAX_CAMERA_BYTES)},"image/jpeg")
    // Bound all retained PDF page bitmaps together to eight million pixels
    // (32 MB of ARGB pixels), while keeping the existing one/two-page quality.
    val perPageEdge=kotlin.math.sqrt(8_000_000.0/files.size).toInt().coerceAtLeast(1)
    val edges=listOf(1440,1080,720,512).map {minOf(it,perPageEdge)}.distinct()
    for(edge in edges) {
        ensureActive();val document=PdfDocument();val bitmaps=mutableListOf<Bitmap>()
        try {
            files.forEachIndexed {index,file->
                ensureActive();val bitmap=sampledReceiptImage(file.inputStream().use {boundedRead(it,MAX_CAMERA_BYTES)},edge);bitmaps+=bitmap
                val page=document.startPage(PdfDocument.PageInfo.Builder(612,792,index+1).create())
                try {
                    val scale=min(576f/bitmap.width,756f/bitmap.height)
                    page.canvas.drawColor(android.graphics.Color.WHITE)
                    page.canvas.drawBitmap(bitmap,null,RectF(18f,18f,18f+bitmap.width*scale,18f+bitmap.height*scale),android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
                } finally {document.finishPage(page)}
            }
            val output=ReceiptOutput();document.writeTo(output);ensureActive();return@withContext ReceiptCapture(output.result(),"application/pdf")
        } catch(_:ReceiptTooLarge) { /* Retry with smaller bounded page images. */ }
        finally {document.close();bitmaps.forEach {it.recycle()}}
    }
    error("This scan exceeds 5 MB. Remove some pages and save smaller receipt scans.")
}

/** Multi-page workflow around actual camera captures; no simulated capture results. */
@Composable fun ReceiptScanner(repo:DriverRepository,accept:(ReceiptCapture)->Unit,close:()->Unit) {
    val identity=remember {receiptScope(repo)};val jobs=rememberCoroutineScope()
    val session=rememberSaveable {uuid()}
    val folder=remember(session) {File(File(repo.app.cacheDir,"shared"),"receipt-scan-$session").apply {mkdirs()}}
    var pages by rememberSaveable(stateSaver=listSaver<List<File>,String>(save={it.map(File::getPath)},restore={it.map(::File)})) {mutableStateOf(emptyList<File>())}
    var selected by rememberSaveable {mutableIntStateOf(0)}
    var pendingPath by rememberSaveable {mutableStateOf<String?>(null)};var replace by rememberSaveable {mutableStateOf<Int?>(null)}
    val localContext=LocalContext.current
    val activity=remember(localContext) {var value:Context?=localContext;var result:Activity?=null;repeat(16) {val item=value;if(item is Activity)result=item;value=(item as? ContextWrapper)?.baseContext};result}
    var preview by remember {mutableStateOf<Bitmap?>(null)};var busy by remember {mutableStateOf(false)}
    var error by remember {mutableStateOf<String?>(null)};var discard by remember {mutableStateOf(false)}
    fun current()=identity==receiptScope(repo)
    val capture=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) {success->
        val target=pendingPath?.let(::File);val index=replace;pendingPath=null;replace=null
        if(target!=null) {
            if(success && current()) jobs.launch {
                busy=true;error=null
                try {
                    val bitmap=withContext(Dispatchers.IO) {sampledReceiptImage(target.inputStream().use {boundedRead(it,MAX_CAMERA_BYTES)})}
                    bitmap.recycle();check(current()) {"Your account changed. This capture was not attached."}
                    if(index!=null && index in pages.indices) {val old=pages[index];pages=pages.toMutableList().apply {set(index,target)};old.delete();selected=index}
                    else {pages=pages+target;selected=pages.lastIndex}
                } catch(failure:Exception) {
                    if(failure is CancellationException)throw failure
                    // Keep camera originals after processing failure. A failed new
                    // page stays reviewable/removable; failed retakes keep the old
                    // page and the attempted source until explicit scan disposition.
                    if(current() && index==null && target.exists()) {pages=pages+target;selected=pages.lastIndex}
                    error=(failure.message ?: "This captured page could not be opened.")+" The camera source is kept; retake, remove or discard it after review."
                }
                finally {busy=false}
            } else target.delete()
        }
    }
    fun take(index:Int?=null) {
        if(busy || !current())return
        try {
            require(index!=null || pages.size<12) {"Scan up to 12 pages per receipt."}
            val target=File(folder,"page-${uuid()}.jpg");pendingPath=target.path;replace=index
            capture.launch(FileProvider.getUriForFile(repo.app,repo.app.packageName+".files",target))
        } catch(failure:Exception) {pendingPath=null;replace=null;error="No camera capture could start. Existing captured pages are kept. Choose a receipt file instead, or try again."}
    }
    LaunchedEffect(pages,selected) {
        preview=null
        pages.getOrNull(selected)?.let {file->try {preview=withContext(Dispatchers.IO) {sampledReceiptImage(file.inputStream().use {boundedRead(it,MAX_CAMERA_BYTES)})}} catch(failure:Exception) {if(failure is CancellationException)throw failure;error=failure.message}}
    }
    LaunchedEffect(receiptScope(repo)) {if(!current())close()}
    DisposableEffect(folder,activity) {onDispose {if(activity?.isChangingConfigurations!=true) {folder.listFiles()?.forEach {it.delete()};folder.delete()}}}
    fun leave() {if(pages.isNotEmpty())discard=true else close()}
    Dialog(onDismissRequest={if(!busy)leave()},properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)) {
        Surface(Modifier.fillMaxSize(),color=Ink) {Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                TextButton(onClick={leave()},enabled=!busy) {Text("Cancel",color=Link)}
                Text("Scan receipt",Modifier.weight(1f),style=MaterialTheme.typography.titleLarge)
                TextButton(enabled=pages.isNotEmpty() && !busy,onClick={jobs.launch {
                    busy=true;error=null
                    try {check(current());val value=scannedReceipt(pages);check(current());accept(value);close()}
                    catch(failure:Exception) {if(failure is CancellationException)throw failure;error=failure.message}
                    finally {busy=false}
                }}) {Text(if(busy) "Preparing…" else "Use scan",color=Link)}
            }
            Text("Place each page flat and fill the camera frame. Review every capture before using the scan.",color=Muted)
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center) {
                preview?.let {Image(it.asImageBitmap(),"Receipt page ${selected+1}",Modifier.fillMaxSize(),contentScale=ContentScale.Fit)}
                    ?: Text(if(pages.isEmpty()) "Take the first page to begin." else "Opening page…",color=Muted)
            }
            if(pages.isNotEmpty()) {
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                    TextButton(enabled=selected>0 && !busy,onClick={selected--}) {Text("Previous")};Text("Page ${selected+1} of ${pages.size}")
                    TextButton(enabled=selected<pages.lastIndex && !busy,onClick={selected++}) {Text("Next")}
                }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly) {
                    TextButton(enabled=!busy,onClick={take(selected)}) {Text("Retake page")}
                    TextButton(enabled=!busy,onClick={val file=pages[selected];pages=pages.filterNot {it==file};file.delete();selected=selected.coerceAtMost((pages.size-1).coerceAtLeast(0))}) {Text("Remove page",color=Danger)}
                }
            }
            if(busy)LinearProgressIndicator(Modifier.fillMaxWidth(),color=Route)
            error?.let {Text(it,color=Caution)}
            Action(if(pages.isEmpty()) "Take first page" else "Add another page",{take()},enabled=!busy && pages.size<12)
            Text("Up to 12 pages · Saved receipt up to 5 MB. Multiple pages are saved as a PDF; receipt suggestions read the first page.",color=Muted,style=MaterialTheme.typography.bodySmall)
        }}
    }
    if(discard)AlertDialog(onDismissRequest={discard=false},title={Text("Discard this scan?")},text={Text("These camera pages have not been attached. Your saved receipts and original expense stay unchanged.")},confirmButton={TextButton(onClick={discard=false;close()}) {Text("Discard scan",color=Danger)}},dismissButton={TextButton(onClick={discard=false}) {Text("Keep reviewing")}})
}
