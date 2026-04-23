package com.hxhoutiku.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hxhoutiku.app.R
import okhttp3.*
import okio.ByteString
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
 *
 * Lifecycle: Start from MainActivity when user configures recipient token.
 *            Stop when user logs out or app explicitly disconnects.
 */
class HxWebSocketService : Service() {

    private val TAG = "HxWebSocket"
    private val NOTIFICATION_ID = 2001
    private val CHANNEL_ID = "hx_ws_foreground"

    /** Ping interval — must be < 30s to survive most NAT/firewall timeouts */
    private val PING_INTERVAL_MS = 25_000L
    private val RECONNECT_BASE_DELAY_MS = 1_000L
    private val RECONNECT_MAX_DELAY_MS = 60_000L

    private var webSocket: WebSocket? = null
    private var client: OkHttpClient? = null
    private var pingHandler: Handler? = null
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

        @Volatile
        private var onMessageListener: WsMessageListener? = null

        fun setMessageListener(listener: WsMessageListener?) {
            onMessageListener = listener
        }

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
        Log.i(TAG, "WebSocket service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                wsUrl = intent.getStringExtra(EXTRA_WS_URL) ?: ""
                recipientToken = intent.getStringExtra(EXTRA_TOKEN) ?: ""
                recipientId = intent.getStringExtra(EXTRA_RECIPIENT_ID) ?: ""
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

    override fun onDestroy() {
        isUserInitiatedDisconnect = true
        disconnect()
        pingHandler?.removeCallbacksAndMessages(null)
        pingHandler = null
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

        // Build URL with auth params
        val url = "$wsUrl?token=${recipientToken}&recipient_id=${recipientId}"
        Log.d(TAG, "Connecting to $url")

        val request = Request.Builder().url(url).build()

        client?.newWebSocket(request, wsListener)
    }

    private fun disconnect() {
        try {
            webSocket?.close(1000, "User disconnect")
        } catch (_: Exception) {}
        webSocket = null
        cancelPing()
    }

    private fun scheduleReconnect() {
        if (isUserInitiatedDisconnect) return

        Log.d(TAG, "Scheduling reconnect in ${reconnectDelayMs}ms")
        pingHandler?.postDelayed({
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
            this@HxWebSocketService.webSocket = webSocket
            resetBackoff()
            schedulePing()
            broadcast(MSG_WS_CONNECTED, """{"connected":true}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "WS message: ${text.take(120)}…")
            broadcast(MSG_WS_MESSAGE, text)
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
            this@HxWebSocketService.webSocket = null
            cancelPing()
            broadcast(MSG_WS_DISCONNECTED, """{"code":$code,"reason":"$reason"}""")
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WS failure", t)
            this@HxWebSocketService.webSocket = null
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

    // ─── Notification ───────────────────────────────────────────

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
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.ws_notification_title))
            .setContentText(getString(R.string.ws_notification_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    // ─── Message Delivery ───────────────────────────────────────

    private fun broadcast(type: String, data: String) {
        val intent = Intent(ACTION_WS_BROADCAST).apply {
            putExtra(BROADCAST_EXTRA_TYPE, type)
            putExtra(BROADCAST_EXTRA_DATA, data)
        }
        sendBroadcast(intent)

        onMessageListener?.onWsMessage(type, data)
    }
}
