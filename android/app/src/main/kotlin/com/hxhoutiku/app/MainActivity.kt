package com.hxhoutiku.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await

/**
 * Hybrid Android shell: WebView loads the React frontend,
 * native code handles notification permissions, FCM token, and background push.
 *
 * JS Bridge (`window.HxNative`) exposes:
 *   - getFcmToken()          → returns FCM device token (async, via callback)
 *   - requestNotification()  → triggers system notification permission dialog
 *   - getNotificationStatus()→ returns "granted" | "denied" | "default"
 *   - getPlatform()          → returns "android"
 *   - getAppVersion()        → returns app version string
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Permission request launcher
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val status = if (granted) "granted" else "denied"
            webView.evaluateJavascript(
                "window.__hxNativeNotificationCallback && window.__hxNativeNotificationCallback('$status')",
                null
            )
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        // Create WebView programmatically (no XML layout needed)
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))

            // Keep the screen on when active
            keepScreenOn = false

            // Fit system windows for edge-to-edge
            fitsSystemWindows = true
            systemUiVisibility = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }

        setContentView(webView)

        configureWebView()

        // Load the frontend
        val apiBase = getApiBase()
        if (apiBase.isNotBlank()) {
            webView.loadUrl(apiBase)
        } else {
            webView.loadUrl("file:///android_asset/index.html")
        }

        // Request notification permission proactively on first launch
        requestNotificationPermissionIfNeeded()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true

            // Modern web features
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true

            // Cache
            cacheMode = if (isNetworkAvailable()) {
                WebSettings.LOAD_DEFAULT
            } else {
                WebSettings.LOAD_CACHE_ELSE_NETWORK
            }

            // User agent suffix for frontend detection
            userAgentString = "$userAgentString HxNativeAndroid/${BuildConfig.VERSION_NAME}"
        }

        // Inject JS Bridge
        webView.addJavascriptInterface(HxNativeBridge(), "HxNative")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Inject safe-area CSS variables for notch/status bar
                injectSafeAreaInsets()
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                val apiBase = getApiBase()
                // Keep navigation within our domain
                if (apiBase.isNotBlank() && url.startsWith(apiBase)) return false
                // External links: open in system browser
                try {
                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
                    intent.data = android.net.Uri.parse(url)
                    startActivity(intent)
                } catch (_: Exception) { }
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    view?.loadUrl("file:///android_asset/offline.html")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
                msg?.let {
                    Log.d("WebView", "${it.sourceId()}:${it.lineNumber()} — ${it.message()}")
                }
                return true
            }
        }
    }

    private fun injectSafeAreaInsets() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val insets = window.decorView.rootWindowInsets
            if (insets != null) {
                val systemBars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
                val density = resources.displayMetrics.density
                val top = (systemBars.top / density).toInt()
                val bottom = (systemBars.bottom / density).toInt()
                webView.evaluateJavascript(
                    """
                    document.documentElement.style.setProperty('--sat', '${top}px');
                    document.documentElement.style.setProperty('--sab', '${bottom}px');
                    """.trimIndent(),
                    null
                )
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun getApiBase(): String {
        val prefs = getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
        val stored = prefs.getString("api_base", null)
        if (!stored.isNullOrBlank()) return stored.trimEnd('/')
        val buildConfig = BuildConfig.API_BASE
        if (buildConfig.isNotBlank()) return buildConfig.trimEnd('/')
        return ""
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        webView.destroy()
        super.onDestroy()
    }

    // ─── JS Bridge ───

    @Suppress("unused")
    inner class HxNativeBridge {

        @JavascriptInterface
        fun getPlatform(): String = "android"

        @JavascriptInterface
        fun getAppVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun getNotificationStatus(): String {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                when (ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.POST_NOTIFICATIONS
                )) {
                    PackageManager.PERMISSION_GRANTED -> "granted"
                    else -> "denied"
                }
            } else {
                "granted" // Pre-13 doesn't need runtime permission
            }
        }

        @JavascriptInterface
        fun requestNotification() {
            runOnUiThread {
                requestNotificationPermissionIfNeeded()
            }
        }

        /**
         * Get FCM token asynchronously.
         * Result is delivered via `window.__hxNativeFcmCallback(token)`.
         */
        @JavascriptInterface
        fun getFcmToken() {
            scope.launch {
                try {
                    val token = FirebaseMessaging.getInstance().token.await()
                    withContext(Dispatchers.Main) {
                        webView.evaluateJavascript(
                            "window.__hxNativeFcmCallback && window.__hxNativeFcmCallback('$token')",
                            null
                        )
                    }
                } catch (e: Exception) {
                    Log.e("HxBridge", "Failed to get FCM token", e)
                    withContext(Dispatchers.Main) {
                        webView.evaluateJavascript(
                            "window.__hxNativeFcmCallback && window.__hxNativeFcmCallback(null)",
                            null
                        )
                    }
                }
            }
        }

        /**
         * Register FCM subscription with the backend.
         * Called from JS after user configures their recipient token.
         */
        @JavascriptInterface
        fun registerFcmPush(apiBase: String, recipientToken: String) {
            // Cache credentials for FCM service background re-registration
            getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
                .edit()
                .putString("api_base", apiBase)
                .putString("recipient_token", recipientToken)
                .apply()

            scope.launch(Dispatchers.IO) {
                try {
                    val fcmToken = FirebaseMessaging.getInstance().token.await()
                    val url = "${apiBase.trimEnd('/')}/api/subscribe"
                    val body = """{"endpoint":"fcm://$fcmToken","keys":{"p256dh":"native-fcm","auth":"native-fcm"}}"""

                    val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("Authorization", "Bearer $recipientToken")
                    conn.doOutput = true
                    conn.outputStream.write(body.toByteArray())

                    val code = conn.responseCode
                    Log.d("HxBridge", "FCM push registered: HTTP $code")

                    withContext(Dispatchers.Main) {
                        webView.evaluateJavascript(
                            "window.__hxNativeFcmRegisterCallback && window.__hxNativeFcmRegisterCallback($code)",
                            null
                        )
                    }
                } catch (e: Exception) {
                    Log.e("HxBridge", "FCM push registration failed", e)
                    withContext(Dispatchers.Main) {
                        webView.evaluateJavascript(
                            "window.__hxNativeFcmRegisterCallback && window.__hxNativeFcmRegisterCallback(0)",
                            null
                        )
                    }
                }
            }
        }

        /**
         * Save API base URL from the setup page.
         * Called from the local index.html setup guide.
         */
        @JavascriptInterface
        fun saveApiBase(url: String) {
            getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
                .edit()
                .putString("api_base", url.trimEnd('/'))
                .apply()
        }

        @JavascriptInterface
        fun showToast(message: String) {
            runOnUiThread {
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
            }
        }
    }
}
