package com.ridesharetaxpros.driver.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.time.*
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DateField(label:String,value:String,onChange:(String)->Unit) {
    var open by remember {mutableStateOf(false)}
    val selected=runCatching {LocalDate.parse(value)}.getOrDefault(LocalDate.now())
    Row(Modifier.fillMaxWidth().heightIn(min=48.dp).clickable {open=true},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
        Text(label);Text(selected.format(DateTimeFormatter.ofPattern("MMM d, yyyy")),color=Pink)
    }
    if(open) {
        val state=rememberDatePickerState(initialSelectedDateMillis=selected.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest={open=false},confirmButton={TextButton(onClick={state.selectedDateMillis?.let {onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString())};open=false}) {Text("Done")}},dismissButton={TextButton(onClick={open=false}) {Text("Cancel")}}) {DatePicker(state)}
    }
}
@Composable fun TimeField(label:String,value:String,onChange:(String)->Unit) {
    val context=LocalContext.current;val time=runCatching {LocalTime.parse(value)}.getOrDefault(LocalTime.now())
    Row(Modifier.fillMaxWidth().heightIn(min=48.dp).clickable {
        android.app.TimePickerDialog(context,{_,hour,minute->onChange("%02d:%02d".format(java.util.Locale.US,hour,minute))},time.hour,time.minute,true).show()
    },verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {Text(label);Text(time.format(DateTimeFormatter.ofPattern("h:mm a")),color=Pink)}
}
