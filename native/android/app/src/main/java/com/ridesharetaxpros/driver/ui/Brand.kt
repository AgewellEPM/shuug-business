package com.ridesharetaxpros.driver.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit
import java.text.NumberFormat
import java.util.Locale

// The same semantic colors and geometry used by the native iPhone screens.
val Ink=Color(0xFF03060C); val Purple=Color(0xFFA627F6); val Pink=Color(0xFFF70CE8)
val Panel=Color(0xFF080B12); val Muted=Color(0xFFD5D1DF); val Link=Color(0xFFE3A0FF)
val Border=Color(0xFF9053B7); val Income=Color(0xFF42F5B0); val Route=Color(0xFF36DFFD)
val ExpenseColor=Color(0xFFFFC857); val Caution=Color(0xFFFFE66D); val Danger=Color(0xFFFF5D87)
val panelGradient=Brush.linearGradient(listOf(Color(0xFF1D122C),Panel))
val actionGradient=Brush.horizontalGradient(listOf(Color(0xFF9129FF),Color(0xFFF306E5)))
internal val LocalGroupedForm=staticCompositionLocalOf {false}
private val LocalChoiceValueColor=staticCompositionLocalOf {Pink}
fun usd(cents: Number): String=NumberFormat.getCurrencyInstance(Locale.US).format(cents.toDouble()/100)

@Composable fun BrandTheme(content: @Composable ()->Unit) {
    MaterialTheme(colorScheme=darkColorScheme(primary=Pink,secondary=Purple,tertiary=Route,background=Ink,surface=Panel,
        surfaceVariant=Color(0xFF18131F),onSurface=Color.White,onBackground=Color.White,onPrimary=Color.White,outline=Border),
        shapes=Shapes(small=RoundedCornerShape(14.dp),medium=RoundedCornerShape(18.dp),large=RoundedCornerShape(22.dp))) {
        // SwiftUI uses the font's own leading. Material's fixed 24sp body leading
        // otherwise survives Text(fontSize=12.sp), turning compact dashboard and
        // form captions into oversized rows at the same logical screen width.
        androidx.compose.runtime.CompositionLocalProvider(LocalTextStyle provides TextStyle(
            fontSize=17.sp,lineHeight=TextUnit.Unspecified,letterSpacing=0.sp),content=content)
    }
}
@Composable fun Panel(title: String?=null,accent:Color=Pink,highlight:Boolean=false,inset:androidx.compose.ui.unit.Dp=16.dp,content: @Composable ColumnScope.()->Unit) {
    Column(Modifier.fillMaxWidth().background(panelGradient,RoundedCornerShape(22.dp))
        .border(if(highlight)1.4.dp else .8.dp,Brush.linearGradient(listOf(accent.copy(alpha=if(highlight).95f else .55f),Purple.copy(alpha=.35f),Border.copy(alpha=.35f))),RoundedCornerShape(22.dp))
        .padding(inset),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        title?.let { Text(it,fontSize=17.sp,fontWeight=FontWeight.SemiBold) }; content()
    }
}
@Composable fun Action(label: String,onClick: ()->Unit,primary: Boolean=true,enabled: Boolean=true,icon:ImageVector?=null) {
    if(LocalGroupedForm.current) {
        Row(Modifier.fillMaxWidth().clickable(enabled=enabled,onClick=onClick).padding(vertical=14.dp),
            verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            icon?.let {Icon(it,null,Modifier.size(20.dp),tint=if(enabled)Pink else Color(0xFF626266))}
            Text(label,fontSize=17.sp,color=if(enabled) Pink else Color(0xFF626266))
        }
        HorizontalDivider(color=Color.White.copy(alpha=.10f),thickness=.5.dp)
        return
    }
    val shape=RoundedCornerShape(18.dp)
    Surface(onClick=onClick,enabled=enabled,color=Color.Transparent,shape=shape,
        modifier=Modifier.fillMaxWidth().heightIn(min=48.dp).background(if(primary) actionGradient else Brush.linearGradient(listOf(Panel,Panel)),shape)
            .border(1.dp,if(primary) Pink.copy(alpha=.35f) else Border,shape)) {
        Row(Modifier.padding(horizontal=14.dp,vertical=14.dp),horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically) {
            icon?.let {Icon(it,null,Modifier.padding(end=8.dp).size(24.dp),tint=Color.White.copy(alpha=if(enabled)1f else .4f))}
            Text(label,color=Color.White.copy(alpha=if(enabled) 1f else .4f),
                fontSize=17.sp,fontWeight=FontWeight.SemiBold,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}
/** Native grouped form sections used by the same iPhone planning screens. */
@Composable fun FormSection(title:String?=null,background:Color=Color(0xFF1C1C1E),spacing:androidx.compose.ui.unit.Dp=8.dp,content:@Composable ColumnScope.()->Unit) {
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(10.dp)) {
        if(title!=null) Text(title,Modifier.padding(start=20.dp,top=14.dp),fontSize=17.sp,color=Color(0xFF8E8E93),fontWeight=FontWeight.SemiBold)
        CompositionLocalProvider(LocalGroupedForm provides true,LocalChoiceValueColor provides if(background==Panel) Muted else Pink) {
            Column(Modifier.fillMaxWidth().background(background,RoundedCornerShape(24.dp))
                .padding(horizontal=20.dp,vertical=8.dp),verticalArrangement=Arrangement.spacedBy(spacing),content=content)
        }
    }
}
@Composable fun Field(label: String,value: String,onChange: (String)->Unit,multiline: Boolean=false,secret: Boolean=false) {
    val keyboard=when {secret->KeyboardType.Password;label.contains("email",true)->KeyboardType.Email;label.contains("address",true) && label.contains("HTTPS",true)->KeyboardType.Uri
        label.contains("($)") || label.contains("miles",true) || label.contains("amount",true) || label.contains("minutes",true) || label.contains("%") -> KeyboardType.Decimal
        else->KeyboardType.Text}
    Column(Modifier.fillMaxWidth()) {
        BasicTextField(value,onChange,Modifier.fillMaxWidth().semantics {contentDescription=label}.padding(vertical=13.dp),singleLine=!multiline,
            textStyle=TextStyle(color=Color.White,fontSize=17.sp),cursorBrush=SolidColor(Pink),
            keyboardOptions=KeyboardOptions(keyboardType=keyboard),visualTransformation=if(secret) PasswordVisualTransformation() else VisualTransformation.None,
            decorationBox={ inner->Box {if(value.isEmpty()) Text(label,color=Muted.copy(alpha=.65f),fontSize=17.sp);inner()} })
        HorizontalDivider(color=Color.White.copy(alpha=.10f),thickness=.5.dp)
    }
}
@Composable fun Choice(label: String,value: String,values: Map<String,String>,onChange: (String)->Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(Modifier.fillMaxWidth().heightIn(min=48.dp).clickable {open=true}.padding(vertical=9.dp),
            verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
            Text(label,Modifier.weight(1f),fontSize=17.sp)
            Text(values[value] ?: value,color=LocalChoiceValueColor.current,fontSize=16.sp)
            Icon(Icons.Default.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
        }
        DropdownMenu(expanded=open,onDismissRequest={open=false},containerColor=Panel) {
            values.forEach { (key,name)->DropdownMenuItem(text={Text(name,color=if(key==value) Pink else Color.White)},onClick={onChange(key);open=false}) }
        }
    }
}
@Composable fun Toggle(label: String,value: Boolean,onChange: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)) {
        Text(label,Modifier.weight(1f),fontSize=17.sp);Switch(value,onChange,colors=SwitchDefaults.colors(checkedTrackColor=Income,checkedThumbColor=Color.White))
    }
}
@Composable fun NavigationRow(label: String,onClick: ()->Unit,detail: String?=null) {
    Row(Modifier.fillMaxWidth().heightIn(min=48.dp).clickable(onClick=onClick).padding(vertical=9.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {Text(label,fontSize=17.sp);detail?.let {Text(it,fontSize=12.sp,color=Muted)}}
        Icon(Icons.Default.ChevronRight,null,Modifier.size(18.dp),tint=Muted)
    }
}
val classifications=linkedMapOf("unclassified" to "Review later","business" to "Business","personal" to "Personal")
