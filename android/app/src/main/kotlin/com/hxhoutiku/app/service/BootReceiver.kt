package com.hxhoutiku.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts the WebSocket foreground service after device reboot.
 *
 * Since we rely entirely on WebSocket (no FCM), the persistent connection
 * must be re-established after boot to continue receiving push notifications.
 *
 * Only starts if saved credentials exist in SharedPreferences.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
        val apiBase = prefs.getString("api_base", null)
        val recipientToken = prefs.getString("recipient_token", null)

        if (apiBase.isNullOrBlank() || recipientToken.isNullOrBlank()) {
            Log.d("BootReceiver", "No saved credentials — skip WS auto-start")
            return
        }

        // Derive WS URL from the API base (frontend URL → API URL pattern)
        // The frontend JS normally calls startWebSocket with the correct wsUrl,
        // but after boot we need to reconstruct it from saved prefs.
        val wsApiBase = prefs.getString("ws_api_base", null)
        val wsToken = prefs.getString("ws_token", null)
        val wsRecipientId = prefs.getString("ws_recipient_id", null)

        if (wsApiBase.isNullOrBlank() || wsToken.isNullOrBlank() || wsRecipientId.isNullOrBlank()) {
            Log.d("BootReceiver", "No saved WS credentials — skip WS auto-start")
            return
        }

        Log.i("BootReceiver", "Boot completed — restarting WebSocket service")
        HxWebSocketService.start(context, wsApiBase, wsToken, wsRecipientId)
    }
}
