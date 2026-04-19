package com.hxhoutiku.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.hxhoutiku.app.ui.HxNavHost
import com.hxhoutiku.app.ui.theme.HxTheme
import com.hxhoutiku.app.updater.AppUpdater
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var appUpdater: AppUpdater

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            HxTheme {
                HxNavHost()
            }
        }

        // 启动时静默检查更新（不阻塞 UI）
        lifecycleScope.launch {
            appUpdater.checkForUpdate()
        }
    }
}
