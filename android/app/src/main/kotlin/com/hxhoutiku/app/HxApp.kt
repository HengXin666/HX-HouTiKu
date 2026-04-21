package com.hxhoutiku.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class HxApp : Application() {

    companion object {
        const val CHANNEL_URGENT = "hx_push_urgent"
        const val CHANNEL_HIGH = "hx_push_high"
        const val CHANNEL_DEFAULT = "hx_push_default"
        const val CHANNEL_LOW = "hx_push_low"
        const val CHANNEL_DEBUG = "hx_push_debug"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java) ?: return

        val urgent = NotificationChannel(
            CHANNEL_URGENT,
            getString(R.string.channel_urgent),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.channel_urgent_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200, 100, 200)
            setShowBadge(true)
        }

        val high = NotificationChannel(
            CHANNEL_HIGH,
            getString(R.string.channel_high),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.channel_high_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200)
            setShowBadge(true)
        }

        val default_ = NotificationChannel(
            CHANNEL_DEFAULT,
            getString(R.string.channel_default),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = getString(R.string.channel_default_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 100)
        }

        val low = NotificationChannel(
            CHANNEL_LOW,
            getString(R.string.channel_low),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.channel_low_desc)
            enableVibration(false)
            setShowBadge(false)
        }

        val debug = NotificationChannel(
            CHANNEL_DEBUG,
            getString(R.string.channel_debug),
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = getString(R.string.channel_debug_desc)
            enableVibration(false)
            setShowBadge(false)
        }

        manager.createNotificationChannels(listOf(urgent, high, default_, low, debug))
    }
}
