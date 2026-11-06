package com.ridesharetaxpros.driver.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale

val Ink=Color(0xFF03060C); val Purple=Color(0xFFA627F6); val Pink=Color(0xFFF70CE8); val Panel=Color(0xFF101426); val Muted=Color(0xFFACB5C8)
fun usd(cents: Number): String=NumberFormat.getCurrencyInstance(Locale.US).format(cents.toDouble()/100)
@Composable fun BrandTheme(content: @Composable ()->Unit) { MaterialTheme(colorScheme=darkColorScheme(primary=Purple,secondary=Pink,background=Ink,surface=Panel,onSurface=Color.White,onBackground=Color.White,onPrimary=Color.White),content=content) }
@Composable fun Panel(title: String?=null,content: @Composable ColumnScope.()->Unit) {
    Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Panel,Color(0xFF19102D))),RoundedCornerShape(20.dp)).padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
        title?.let { Text(it,style=MaterialTheme.typography.titleMedium) }; content()
    }
}
@Composable fun Field(label: String,value: String,onChange: (String)->Unit,multiline: Boolean=false,secret: Boolean=false) {
    OutlinedTextField(value,onChange,label={ Text(label) },singleLine=!multiline,modifier=Modifier.fillMaxWidth(),
        visualTransformation=if(secret) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
}
@Composable fun Choice(label: String,value: String,values: Map<String,String>,onChange: (String)->Unit) {
    var open by remember { mutableStateOf(false) }
    Box { OutlinedButton(onClick={open=true},modifier=Modifier.fillMaxWidth()) { Text("$label: ${values[value] ?: value}") }
        DropdownMenu(expanded=open,onDismissRequest={open=false}) { values.forEach { (key,name)-> DropdownMenuItem(text={Text(name)},onClick={onChange(key);open=false}) } }
    }
}
@Composable fun Toggle(label: String,value: Boolean,onChange: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { Text(label,Modifier.weight(1f)); Switch(value,onChange) }
}
val classifications=linkedMapOf("unclassified" to "Needs review","business" to "Business","personal" to "Personal")
