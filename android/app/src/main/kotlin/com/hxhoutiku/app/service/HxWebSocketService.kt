package com.hxhoutiku.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hxhoutiku.app.HxApp
import com.hxhoutiku.app.MainActivity
import com.hxhoutiku.app.R
import okhttp3.*
import okio.ByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * WebSocket Foreground Service — keeps a persistent WS connection alive in the background.
 *
 * Why: FCM is unreliable in China (Google services blocked/unstable).
 * This service uses Cloudflare Durable Object's hibernation API, which costs ~$0 when idle.
 *
 * Architecture:
 *   1. Starts as Foreground Service (required on Android 8.1+)
 *   2. Opens WebSocket to /api/ws?token=xxx&recipient_id=xxx
 *   3. Sends ping every 25s; expects server pong
 *   4. Auto-reconnects with exponential backoff (1s → 60s max)
 *   5. Delivers messages via LocalBroadcast or JS callback when Activity is visible
 *   6. Shows system notifications when app is in background
 *
 * Lifecycle: Start from MainActivity when user configures recipient token.
 *            Stop when user logs out or app explicitly disconnects.
 */
class HxWebSocketService : Service() {

    private val TAG = "HxWebSocket"
    private val NOTIFICATION_ID = 2001
    private val CHANNEL_ID = "hx_ws_foreground"

    /** Ping interval — 55s is safe for most NAT/firewall timeouts (typically 60s+)
     * 参考: https://developer.android.com/develop/connectivity/network-ops/reading-network-state */
    private val PING_INTERVAL_MS = 55_000L
    private val RECONNECT_BASE_DELAY_MS = 1_000L
    private val RECONNECT_MAX_DELAY_MS = 60_000L

    /** Auto-incrementing notification ID for message notifications */
    private var messageNotifId = 3000

    private var webSocket: WebSocket? = null
    private var client: OkHttpClient? = null
    private var pingHandler: Handler? = null
    private var reconnectHandler: Handler? = null
    private var reconnectDelayMs = RECONNECT_BASE_DELAY_MS
    private var isUserInitiatedDisconnect = false


    // Cached credentials set by startAction / updateCredentials
    private var wsUrl: String = ""
    private var recipientToken: String = ""
    private var recipientId: String = ""

    companion object {
        const val ACTION_START = "com.hxhoutiku.app.ws.START"
        const val ACTION_STOP = "com.hxhoutiku.app.ws.STOP"
        const val ACTION_UPDATE_CREDENTIALS = "com.hxhoutiku.app.ws.UPDATE_CREDS"

        const val EXTRA_WS_URL = "ws_url"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_RECIPIENT_ID = "recipient_id"

        const val MSG_WS_CONNECTED = "ws_connected"
        const val MSG_WS_DISCONNECTED = "ws_disconnected"
        const val MSG_WS_MESSAGE = "ws_message"
        const val MSG_WS_ERROR = "ws_error"

        /** Broadcast action for delivering WS messages to the Activity */
        const val ACTION_WS_BROADCAST = "com.hxhoutiku.app.ws.BROADCAST"
        const val BROADCAST_EXTRA_TYPE = "type"
        const val BROADCAST_EXTRA_DATA = "data"

        /**
         * Track whether the Activity is in the foreground.
         * When true, we skip system notifications (the in-app toast handles it).
         * When false (background), we show system-level notifications.
         */
        @Volatile
        var isAppInForeground = false

        /**
         * 当前 WebSocket 连接状态，供 MainActivity 在页面加载完成后
         * 主动推送给 WebView，解决冷启动时 JS 回调尚未注册导致状态丢失的问题。
         * 参考: https://developer.android.com/develop/background-work/services/foreground-services
         */
        @Volatile
        var isConnected = false
            private set

        /** 当前在线设备数量，由服务端 connected 消息更新 */
        @Volatile
        var deviceCount = 0
            private set

        @Volatile
        private var onMessageListener: WsMessageListener? = null

        fun setMessageListener(listener: WsMessageListener?) {
            onMessageListener = listener
        }

        /**
         * 解密回调接口 — 由 MainActivity 注册，用于将加密消息传给 WebView JS 解密。
         * 解密完成后 JS 通过 HxNativeBridge.updateNotification() 回调更新通知内容。
         * 参考: https://developer.android.com/develop/ui/views/notifications/build-notification#update-notification
         */
        interface DecryptCallback {
            fun requestDecrypt(notifId: Int, encryptedData: String, messageId: String)
        }

        @Volatile
        private var decryptCallback: DecryptCallback? = null

        fun setDecryptCallback(callback: DecryptCallback?) {
            decryptCallback = callback
        }

        /**
         * 更新已显示的通知内容（解密后调用）。
         * 由 MainActivity 的 JS Bridge 调用。
         * 参考: https://developer.android.com/reference/android/app/NotificationManager#notify(int,%20android.app.Notification)
         */
        fun updateNotification(context: Context, notifId: Int, title: String, body: String) {
            val channelId = notifIdToChannel[notifId] ?: HxApp.CHANNEL_DEFAULT
            val messageId = notifIdToMessageId[notifId] ?: ""

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("message_id", messageId)
            }
            val pendingIntent = PendingIntent.getActivity(
                context, notifId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup("hx_messages")
                .setColor(0xFF1D9BF0.toInt())

            val manager = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(notifId, builder.build())
        }

        /** 通知 ID → 通知渠道 ID 的映射，用于更新通知时保持渠道一致 */
        private val notifIdToChannel = mutableMapOf<Int, String>()
        /** 通知 ID → 消息 ID 的映射，用于更新通知时保持跳转目标一致 */
        private val notifIdToMessageId = mutableMapOf<Int, String>()

        /**
         * Start the WebSocket foreground service.
         */
        fun start(context: Context, wsUrl: String, token: String, recipientId: String) {
            val intent = Intent(context, HxWebSocketService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_WS_URL, wsUrl)
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_RECIPIENT_ID, recipientId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /**
         * Stop the service gracefully.
         */
        fun stop(context: Context) {
            val intent = Intent(context, HxWebSocketService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        /**
         * Update credentials without restarting (e.g., token refresh).
         */
        fun updateCredentials(context: Context, token: String, recipientId: String) {
            val intent = Intent(context, HxWebSocketService::class.java).apply {
                action = ACTION_UPDATE_CREDENTIALS
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_RECIPIENT_ID, recipientId)
            }
            context.startService(intent)
        }
    }

    /** In-process callback for when the Activity is in foreground */
    interface WsMessageListener {
        fun onWsMessage(type: String, data: String)
    }

    // ─── Service Lifecycle ──────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForegroundNotification()

        client = OkHttpClient.Builder()
            .pingInterval(0, TimeUnit.SECONDS) // We manage pings ourselves
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MINUTES)   // No read timeout — WS stays open
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()

        pingHandler = Handler(Looper.getMainLooper())
        reconnectHandler = Handler(Looper.getMainLooper())
        Log.i(TAG, "WebSocket service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val newUrl = intent.getStringExtra(EXTRA_WS_URL) ?: ""
                val newToken = intent.getStringExtra(EXTRA_TOKEN) ?: ""
                val newId = intent.getStringExtra(EXTRA_RECIPIENT_ID) ?: ""

                // 如果凭据相同且已有活跃连接，跳过重复启动
                if (newUrl == wsUrl && newToken == recipientToken && newId == recipientId
                    && webSocket != null) {
                    Log.d(TAG, "WS already connected with same credentials, skipping")
                    return START_STICKY
                }

                wsUrl = newUrl
                recipientToken = newToken
                recipientId = newId
                isUserInitiatedDisconnect = false
                connect()
            }
            ACTION_STOP -> {
                isUserInitiatedDisconnect = true
                disconnect()
                stopSelf()
            }
            ACTION_UPDATE_CREDENTIALS -> {
                val newToken = intent.getStringExtra(EXTRA_TOKEN) ?: ""
                val newRecipientId = intent.getStringExtra(EXTRA_RECIPIENT_ID) ?: ""
                if (newToken.isNotBlank() && newRecipientId.isNotBlank()) {
                    val needsReconnect = (recipientToken != newToken || recipientId != newRecipientId)
                    recipientToken = newToken
                    recipientId = newRecipientId
                    if (needsReconnect && webSocket != null) {
                        disconnect()
                        connect()
                    }
                }
            }
        }
        // START_STICKY: system will restart the service if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?) = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        // 前台服务 + START_STICKY 已足够保活，不再使用 AlarmManager 激进重启
        // 参考: https://developer.android.com/develop/background-work/services/foreground-services
        Log.i(TAG, "Task removed — foreground service continues running")
    }

    override fun onLowMemory() {
        super.onLowMemory()
        // 低内存时不释放核心资源，仅记录日志
        Log.w(TAG, "Low memory warning — keeping WS connection alive")
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_MODERATE) {
            Log.w(TAG, "Trim memory level=$level — WS connection preserved")
        }
    }

    override fun onDestroy() {
        isUserInitiatedDisconnect = true
        isConnected = false
        // 服务销毁时优雅关闭连接
        val ws = webSocket
        webSocket = null
        cancelPing()
        reconnectHandler?.removeCallbacksAndMessages(null)
        try { ws?.close(1000, "Service destroyed") } catch (_: Exception) {}
        pingHandler?.removeCallbacksAndMessages(null)
        pingHandler = null
        reconnectHandler?.removeCallbacksAndMessages(null)
        reconnectHandler = null
        client?.dispatcher?.executorService?.shutdown()
        client = null
        Log.i(TAG, "WebSocket service destroyed")
        super.onDestroy()
    }

    // ─── Connection Management ──────────────────────────────────

    private fun connect() {
        if (wsUrl.isBlank() || recipientToken.isBlank() || recipientId.isBlank()) {
            Log.w(TAG, "Cannot connect: missing credentials")
            return
        }

        // 先关闭已有连接，防止重复连接导致服务端设备计数不断增长
        disconnect()

        // Build URL with auth params
        val url = "$wsUrl?token=${recipientToken}&recipient_id=${recipientId}"
        Log.d(TAG, "Connecting to $url")

        val request = Request.Builder().url(url).build()

        client?.newWebSocket(request, wsListener)
    }

    private fun disconnect() {
        val ws = webSocket
        webSocket = null
        cancelPing()
        reconnectHandler?.removeCallbacksAndMessages(null)
        // 使用 cancel() 而非 close()，立即终止连接且不触发 onClosed 回调
        // 避免旧连接的 onClosed 回调干扰新建立的连接
        try {
            ws?.cancel()
        } catch (_: Exception) {}
    }

    private fun scheduleReconnect() {
        if (isUserInitiatedDisconnect) return

        Log.d(TAG, "Scheduling reconnect in ${reconnectDelayMs}ms")
        reconnectHandler?.removeCallbacksAndMessages(null)
        reconnectHandler?.postDelayed({
            if (!isUserInitiatedDisconnect) {
                connect()
            }
        }, reconnectDelayMs)

        // Exponential backoff: 1s → 2s → 4s → ... → 60s cap
        reconnectDelayMs = minOf(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS)
    }

    private fun resetBackoff() {
        reconnectDelayMs = RECONNECT_BASE_DELAY_MS
    }

    // ─── WebSocket Listener ─────────────────────────────────────

    private val wsListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "WebSocket connected")
            // 仅当这是最新创建的连接时才更新引用
            this@HxWebSocketService.webSocket = webSocket
            isConnected = true
            resetBackoff()
            schedulePing()
            broadcast(MSG_WS_CONNECTED, """{"connected":true}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "WS message: ${text.take(120)}…")
            broadcast(MSG_WS_MESSAGE, text)

            // 解析 connected 消息，缓存设备数量供冷启动时推送
            try {
                val json = JSONObject(text)
                if (json.optString("type") == "connected") {
                    deviceCount = json.optInt("device_count", 1)
                }
            } catch (_: Exception) {}

            // Parse and show system notification for new messages when app is in background
            handleIncomingMessage(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            Log.d(TAG, "WS binary message: ${bytes.size} bytes")
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WS closing: $code $reason")
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WS closed: $code $reason")
            // 仅当关闭的是当前活跃连接时才处理，避免旧连接回调干扰新连接
            if (this@HxWebSocketService.webSocket !== webSocket) return
            this@HxWebSocketService.webSocket = null
            isConnected = false
            cancelPing()
            broadcast(MSG_WS_DISCONNECTED, """{"code":$code,"reason":"$reason"}""")
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WS failure", t)
            // 仅当失败的是当前活跃连接时才处理
            if (this@HxWebSocketService.webSocket !== webSocket) return
            this@HxWebSocketService.webSocket = null
            isConnected = false
            cancelPing()
            broadcast(MSG_WS_ERROR, """{"error":"${t.message}"}""")
            scheduleReconnect()
        }
    }

    // ─── Heartbeat ──────────────────────────────────────────────

    private fun schedulePing() {
        cancelPing()
        pingHandler?.postDelayed({
            val ws = webSocket
            if (ws != null) {
                try {
                    // Must exactly match server's setWebSocketAutoResponse request string
                    ws.send("""{"type":"ping"}""")
                    Log.d(TAG, "Ping sent")
                } catch (e: Exception) {
                    Log.w(TAG, "Ping failed", e)
                }
            }
            schedulePing()
        }, PING_INTERVAL_MS)
    }

    private fun cancelPing() {
        pingHandler?.removeCallbacksAndMessages(null)
    }

    // ─── System Notification for New Messages ───────────────────

    /**
     * Parse incoming WS JSON. If it's a new_message, show a system notification.
     *
     * Only shows when the app is NOT in the foreground — when in foreground,
     * the WebView's in-app NotificationToast handles display.
     */
    private fun handleIncomingMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.optString("type", "")

            if (type != "new_message") return

            val msg = json.optJSONObject("message") ?: return
            val msgId = msg.optString("id", "msg-${System.currentTimeMillis()}")
            val priority = msg.optString("priority", "default")
            val group = msg.optString("group", "general")
            val groupKey = msg.optString("group_key", "")

            val encryptedData = msg.optString("encrypted_data", "")
            showMessageNotification(msgId, priority, group, groupKey, encryptedData)

        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse WS message for notification", e)
        }
    }

    /**
     * Show an Android system notification for an incoming message.
     * Uses the priority-based notification channels from HxApp for
     * appropriate sound, vibration, and heads-up display behavior.
     */
    private fun showMessageNotification(messageId: String, priority: String, group: String, groupKey: String = "", encryptedData: String = "") {
        val title = when (priority) {
            "urgent" -> "🔴 紧急 · $group"
            "high" -> "🟠 重要 · $group"
            "low" -> "$group · 低优先级"
            "debug" -> "$group · 调试"
            else -> "$group · 新消息"
        }
        val body = when (priority) {
            "urgent" -> "收到紧急消息，请立即查看"
            "high" -> "收到重要消息，请及时查看"
            "debug" -> "收到调试消息"
            else -> "点击查看详情"
        }

        // Pick the notification channel based on priority
        val channelId = when (priority) {
            "urgent" -> HxApp.CHANNEL_URGENT
            "high" -> HxApp.CHANNEL_HIGH
            "low" -> HxApp.CHANNEL_LOW
            "debug" -> HxApp.CHANNEL_DEBUG
            else -> HxApp.CHANNEL_DEFAULT
        }

        // Allocate notification ID before creating PendingIntent
        // 参考: https://developer.android.com/reference/android/app/PendingIntent#getActivity
        val currentNotifId = messageNotifId++
        if (messageNotifId > 9999) messageNotifId = 3000

        // 缓存通知 ID 与渠道/消息 ID 的映射，供 updateNotification 使用
        notifIdToChannel[currentNotifId] = channelId
        notifIdToMessageId[currentNotifId] = messageId

        // Intent to open the app and navigate to the message
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("message_id", messageId)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, currentNotifId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup("hx_messages")
            .setColor(0xFF1D9BF0.toInt()) // Brand blue

        // Priority-specific enhancements
        when (priority) {
            "urgent" -> {
                builder.setPriority(NotificationCompat.PRIORITY_MAX)
                builder.setDefaults(NotificationCompat.DEFAULT_ALL)
                // Full-screen intent for urgent — shows on lock screen
                builder.setFullScreenIntent(pendingIntent, true)
                builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            }
            "high" -> {
                builder.setPriority(NotificationCompat.PRIORITY_HIGH)
                builder.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
                builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            }
            "low" -> {
                builder.setPriority(NotificationCompat.PRIORITY_LOW)
                builder.setSilent(true)
            }
            "debug" -> {
                builder.setPriority(NotificationCompat.PRIORITY_MIN)
                builder.setSilent(true)
            }
            else -> {
                builder.setPriority(NotificationCompat.PRIORITY_DEFAULT)
                builder.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
                builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            }
        }

        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(currentNotifId, builder.build())

        Log.d(TAG, "System notification shown: $title (channel=$channelId)")

        // 请求 JS 层解密消息内容，解密完成后通过 updateNotification 更新通知
        // 参考: https://developer.android.com/develop/ui/views/notifications/build-notification#update-notification
        if (encryptedData.isNotBlank()) {
            decryptCallback?.requestDecrypt(currentNotifId, encryptedData, messageId)
        }
    }

    // ─── Foreground Service Notification ────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_ws),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.channel_ws_desc)
                setShowBadge(false)
                enableVibration(false)
                enableLights(false)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.ws_notification_title))
            .setContentText(getString(R.string.ws_notification_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    // ─── Message Delivery ───────────────────────────────────────

    private fun broadcast(type: String, data: String) {
        val intent = Intent(ACTION_WS_BROADCAST).apply {
            setPackage(packageName)
            putExtra(BROADCAST_EXTRA_TYPE, type)
            putExtra(BROADCAST_EXTRA_DATA, data)
        }
        sendBroadcast(intent)

        onMessageListener?.onWsMessage(type, data)
    }
}
