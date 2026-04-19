package com.hxhoutiku.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.util.Log
import dagger.hilt.android.HiltAndroidApp
import org.bouncycastle.jce.provider.BouncyCastleProvider
import java.security.Security

@HiltAndroidApp
class HxApp : Application() {

    companion object {
        private const val TAG = "HxApp"
        const val CHANNEL_URGENT = "hx_push_urgent"
        const val CHANNEL_HIGH = "hx_push_high"
        const val CHANNEL_DEFAULT = "hx_push_default"
    }

    override fun onCreate() {
        super.onCreate()

        // Install BouncyCastle early to avoid issues in EciesManager
        setupBouncyCastle()

        // Global crash handler for debugging
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "FATAL UNCAUGHT EXCEPTION on ${thread.name}", throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }

        createNotificationChannels()
    }

    private fun setupBouncyCastle() {
        try {
            // Remove any existing BC provider (Android ships an old one)
            Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME)
            // Add our version at highest priority
            Security.insertProviderAt(BouncyCastleProvider(), 1)
            Log.d(TAG, "BouncyCastle provider installed successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to install BouncyCastle provider", e)
        }
    }

    private fun createNotificationChannels() {
        try {
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
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create notification channels", e)
        }
    }
}
