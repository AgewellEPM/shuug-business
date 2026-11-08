package com.ridesharetaxpros.driver.core

data class TourCaption(val startMs:Long,val endMs:Long,val text:String)

/** Bounded local soft captions; timing follows the native player's seek position. */
fun parseTourCaptions(bytes:ByteArray):List<TourCaption> {
    require(bytes.size<=1024*1024) {"The caption file is too large."}
    val text=bytes.toString(Charsets.UTF_8).removePrefix("\uFEFF").replace("\r\n","\n")
    val timing=Regex("(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})\\s+-->\\s+(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})")
    return text.split(Regex("\\n\\s*\\n")).take(1000).mapNotNull {block->
        val lines=block.lines();val index=lines.indexOfFirst {timing.matches(it.trim())}
        if(index<0) return@mapNotNull null
        val match=timing.matchEntire(lines[index].trim()) ?: return@mapNotNull null
        fun instant(offset:Int):Long {
            val h=match.groupValues[offset].toLong();val m=match.groupValues[offset+1].toLong();val s=match.groupValues[offset+2].toLong()
            require(m<60 && s<60);return ((h*60+m)*60+s)*1000+match.groupValues[offset+3].toLong()
        }
        val start=instant(1);val end=instant(5);val caption=lines.drop(index+1).joinToString("\n").trim().take(2000)
        if(end<=start || caption.isEmpty()) null else TourCaption(start,end,caption)
    }.sortedBy {it.startMs}
}

fun List<TourCaption>.atPosition(positionMs:Long):String?=firstOrNull {positionMs>=it.startMs && positionMs<it.endMs}?.text
