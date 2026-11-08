package com.ridesharetaxpros.driver.core

import kotlin.math.*

data class RoadMapViewport(val center: PositionPoint,val zoom: Double)
data class RoadMapTile(val zoom: Int,val x: Int,val y: Int,val unwrappedX: Int) {
    val key get()="$zoom-$x-$y"
}
object RoadMapProjection {
    fun x(longitude: Double)=(longitude+180)/360
    fun y(latitude: Double): Double {val phi=latitude.coerceIn(-85.05112878,85.05112878)*PI/180;return (1-ln(tan(phi)+1/cos(phi))/PI)/2}
    fun coordinate(x: Double,y: Double)=PositionPoint(atan(sinh(PI*(1-2*y.coerceIn(0.0,1.0))))*180/PI,(((x%1+1)%1)*360)-180)
    fun wrappedDelta(value: Double,center: Double)=(value-center).let {it-round(it)}
    fun fit(points: List<PositionPoint>,width: Double,height: Double): RoadMapViewport {
        val valid=points.filter {it.valid}
        if(valid.isEmpty() || width<=0 || height<=0) return RoadMapViewport(PositionPoint(39.8,-98.6),3.0)
        val anchor=x(valid.first().longitude)
        val xs=valid.map {anchor+wrappedDelta(x(it.longitude),anchor)};val ys=valid.map {y(it.latitude)}
        val spanX=(xs.max()-xs.min()).coerceAtLeast(.00005);val spanY=(ys.max()-ys.min()).coerceAtLeast(.00005)
        val scale=min((width-64).coerceAtLeast(32.0)/(spanX*256),(height-64).coerceAtLeast(32.0)/(spanY*256))
        val zoom=log2(scale).coerceIn(2.0,17.0)
        return RoadMapViewport(coordinate((xs.min()+xs.max())/2,(ys.min()+ys.max())/2),zoom)
    }
    fun visible(viewport: RoadMapViewport,width: Double,height: Double): List<RoadMapTile> {
        if(width<=0 || height<=0 || !viewport.center.valid || !viewport.zoom.isFinite()) return emptyList()
        val z=floor(viewport.zoom.coerceIn(2.0,18.0)).toInt();val count=1 shl z
        val scale=2.0.pow(viewport.zoom-z);val cx=x(viewport.center.longitude)*count*256;val cy=y(viewport.center.latitude)*count*256
        val left=floor((cx-width/scale/2)/256).toInt();val right=floor((cx+width/scale/2)/256).toInt()
        val top=floor((cy-height/scale/2)/256).toInt().coerceAtLeast(0);val bottom=floor((cy+height/scale/2)/256).toInt().coerceAtMost(count-1)
        if(right-left>20 || bottom-top>20) return emptyList()
        return (left..right).flatMap {tileX->(top..bottom).map {tileY->RoadMapTile(z,((tileX%count)+count)%count,tileY,tileX)}}
    }
}
