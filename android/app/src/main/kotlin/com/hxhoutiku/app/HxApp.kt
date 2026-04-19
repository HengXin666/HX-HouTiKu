package com.hxhoutiku.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class HxApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)

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

        val default = NotificationChannel(
            CHANNEL_DEFAULT,
            getString(R.string.channel_default),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = getString(R.string.channel_default_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 100)
        }

        manager.createNotificationChannels(listOf(urgent, high, default))
    }

    companion object {
        const val CHANNEL_URGENT = "hx_push_urgent"
        const val CHANNEL_HIGH = "hx_push_high"
        const val CHANNEL_DEFAULT = "hx_push_default"
    }
}
