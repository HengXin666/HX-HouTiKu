package com.hxhoutiku.app.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.hxhoutiku.app.HxApp
import com.hxhoutiku.app.MainActivity
import com.hxhoutiku.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL

/**
 * FCM push service for WebView hybrid architecture.
 *
 * Responsibilities:
 *  1. Show system notifications when a push arrives (with or without foreground WebView).
 *  2. When a new FCM token is issued, re-register with the backend if we have credentials cached.
 *
 * There is NO decryption here — the WebView (React frontend) handles all crypto.
 * The notification text shows the `group` from the push data or a default label.
 */
class HxFirebaseMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var notifId = 1000

    companion object {
        private const val TAG = "HxFCM"
    }

    // ─── Token refresh ───

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: ${token.take(12)}…")

        // Attempt to re-register using cached credentials
        val prefs = applicationContext.getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
        val apiBase = prefs.getString("api_base", null)
        val recipientToken = prefs.getString("recipient_token", null)

        if (apiBase.isNullOrBlank() || recipientToken.isNullOrBlank()) {
            Log.d(TAG, "No cached credentials — skip re-register")
            return
        }

        scope.launch {
            try {
                val url = URL("${apiBase.trimEnd('/')}/api/subscribe")
                val body = """{"endpoint":"fcm://$token","keys":{"p256dh":"native-fcm","auth":"native-fcm"},"device_type":"android"}"""

                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $recipientToken")
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray()) }

                val code = conn.responseCode
                Log.d(TAG, "FCM token re-registered: HTTP $code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to re-register FCM token", e)
            }
        }
    }

    // ─── Message received ───

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Push received: ${message.data}")

        val data = message.data
        val messageId = data["id"] ?: "msg-${System.currentTimeMillis()}"
        val priority = data["priority"] ?: "default"
        val group = data["group"] ?: "general"

        showNotification(messageId, priority, group)
    }

    // ─── Notification display ───

    private fun showNotification(messageId: String, priority: String, group: String) {
        val title = when (priority) {
            "urgent" -> "⚠️ 紧急 · $group"
            "high" -> "❗ 重要 · $group"
            else -> "📨 $group · 新消息"
        }
        val body = when (priority) {
            "urgent" -> "收到紧急消息，请立即查看"
            "high" -> "收到重要消息，请及时查看"
            "debug" -> "收到调试消息"
            else -> "点击查看详情"
        }

        val channelId = when (priority) {
            "urgent" -> HxApp.CHANNEL_URGENT
            "high" -> HxApp.CHANNEL_HIGH
            "low" -> HxApp.CHANNEL_LOW
            "debug" -> HxApp.CHANNEL_DEBUG
            else -> HxApp.CHANNEL_DEFAULT
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("message_id", messageId)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, notifId, intent,
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
            .setColor(0xFF1D9BF0.toInt())

        when (priority) {
            "urgent" -> {
                builder.setPriority(NotificationCompat.PRIORITY_MAX)
                builder.setDefaults(NotificationCompat.DEFAULT_ALL)
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
                builder.setDefaults(NotificationCompat.DEFAULT_SOUND)
            }
        }

        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notifId++, builder.build())
    }
}
