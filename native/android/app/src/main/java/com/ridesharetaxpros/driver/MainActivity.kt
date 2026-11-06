package com.ridesharetaxpros.driver

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.ridesharetaxpros.driver.data.DriverApplication
import com.ridesharetaxpros.driver.ui.DriverApp

class MainActivity: ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge()
        setContent { DriverApp((application as DriverApplication).repository) }
    }
}
