package com.hxhoutiku.app.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.hxhoutiku.app.HxApp
import com.hxhoutiku.app.MainActivity
import com.hxhoutiku.app.R
import com.hxhoutiku.app.crypto.EciesManager
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.remote.HxApi
import com.hxhoutiku.app.data.remote.dto.SubscribeKeys
import com.hxhoutiku.app.data.remote.dto.SubscribeRequest
import com.hxhoutiku.app.data.repository.DecryptedPayload
import com.hxhoutiku.app.data.repository.MessageRepository
import com.hxhoutiku.app.ui.screen.feed.SessionHolder
import com.squareup.moshi.Moshi
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class HxFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var keyManager: KeyManager
    @Inject lateinit var api: HxApi
    @Inject lateinit var repository: MessageRepository
    @Inject lateinit var moshi: Moshi

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var notifId = 1000

    companion object {
        private const val TAG = "HxFCM"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")

        // Re-register with backend
        val recipientToken = keyManager.getRecipientToken() ?: return
        scope.launch {
            try {
                api.subscribe(
                    auth = "Bearer $recipientToken",
                    body = SubscribeRequest(
                        endpoint = "fcm://$token",
                        keys = SubscribeKeys(p256dh = "native-fcm", auth = "native-fcm")
                    )
                )
                Log.d(TAG, "FCM token re-registered with backend")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to re-register FCM token", e)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Push received: ${message.data}")

        val data = message.data
        val encryptedData = data["encrypted_data"]
        val messageId = data["id"] ?: "unknown-${System.currentTimeMillis()}"
        val priority = data["priority"] ?: "default"
        val group = data["group"] ?: "general"
        val timestamp = data["timestamp"]?.toLongOrNull() ?: System.currentTimeMillis()

        // Try to decrypt and cache if we have the private key in session
        val privateKey = SessionHolder.privateKeyHex
        if (privateKey != null && encryptedData != null) {
            scope.launch {
                try {
                    repository.ingestPushed(
                        encryptedData = encryptedData,
                        messageId = messageId,
                        priority = priority,
                        group = group,
                        timestamp = timestamp,
                        privateKeyHex = privateKey
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decrypt pushed message", e)
                }
            }
        }

        // Always show a system notification
        showNotification(encryptedData, priority, group, messageId, privateKey)
    }

    private fun showNotification(
        encryptedData: String?,
        priority: String,
        group: String,
        messageId: String,
        privateKey: String?
    ) {
        // Try to decrypt title for notification
        var title = "$group · 新消息"
        var body = "点击查看详情"

        if (privateKey != null && encryptedData != null) {
            try {
                val ciphertext = Base64.decode(encryptedData, Base64.DEFAULT)
                val plaintext = EciesManager.decrypt(privateKey, ciphertext)
                val adapter = moshi.adapter(DecryptedPayload::class.java)
                val payload = adapter.fromJson(String(plaintext, Charsets.UTF_8))
                if (payload != null) {
                    title = payload.title
                    body = payload.body.take(100)
                }
            } catch (_: Exception) {
                // Can't decrypt — use default text
            }
        }

        val channelId = when (priority) {
            "urgent" -> HxApp.CHANNEL_URGENT
            "high" -> HxApp.CHANNEL_HIGH
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

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(
                when (priority) {
                    "urgent" -> NotificationCompat.PRIORITY_MAX
                    "high" -> NotificationCompat.PRIORITY_HIGH
                    else -> NotificationCompat.PRIORITY_DEFAULT
                }
            )
            .build()

        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notifId++, notification)
    }
}
