package com.hxhoutiku.app.ui.screen.settings

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.remote.HxApi
import com.hxhoutiku.app.data.remote.dto.SubscribeKeys
import com.hxhoutiku.app.data.remote.dto.SubscribeRequest
import com.hxhoutiku.app.data.repository.MessageRepository
import com.hxhoutiku.app.di.ApiBaseProvider
import com.hxhoutiku.app.updater.AppUpdater
import com.hxhoutiku.app.updater.UpdateInfo
import com.hxhoutiku.app.updater.UpdateState
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class SettingsUiState(
    val recipientName: String = "",
    val publicKey: String = "",
    val recipientToken: String = "",
    val apiBase: String = "",
    val appVersion: String = "",
    val tokenSaved: Boolean = false,
    val tokenError: String? = null,
    val rememberPassword: Boolean = false
)

/**
 * Settings — includes Recipient Token configuration.
 *
 * This is where the user pastes their rt_xxx token after registering
 * their public key via the admin SDK/CLI. Matches the web frontend's
 * Settings.tsx token input flow.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val keyManager: KeyManager,
    private val repository: MessageRepository,
    private val apiBaseProvider: ApiBaseProvider,
    private val api: HxApi,
    val appUpdater: AppUpdater
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState

    val updateState: StateFlow<UpdateState> = appUpdater.state

    init {
        try {
            _uiState.value = SettingsUiState(
                recipientName = keyManager.getRecipientName() ?: "未配置",
                publicKey = keyManager.getPublicKey() ?: "",
                recipientToken = keyManager.getRecipientToken() ?: "",
                apiBase = apiBaseProvider.getBaseUrl(),
                appVersion = com.hxhoutiku.app.BuildConfig.VERSION_NAME,
                rememberPassword = keyManager.isRememberPasswordEnabled()
            )
        } catch (e: Exception) {
            Log.e("SettingsVM", "init failed", e)
            _uiState.value = SettingsUiState(
                recipientName = "加载失败",
                publicKey = "",
                recipientToken = "",
                apiBase = "未知",
                appVersion = "未知"
            )
        }
    }

    /**
     * Save the recipient token that the user pastes in.
     * Matches web frontend: Settings.tsx handleSaveToken()
     *
     * Token format: "rt_{recipient_id}" — the prefix is added if missing.
     * After saving, also register FCM push subscription (non-fatal).
     */
    fun saveRecipientToken(input: String) {
        val trimmed = input.trim()
        if (trimmed.isBlank()) {
            _uiState.update { it.copy(tokenError = "Token 不能为空") }
            return
        }

        // Normalize: ensure rt_ prefix
        val token = if (trimmed.startsWith("rt_")) trimmed else "rt_$trimmed"

        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    keyManager.saveRecipientToken(token)
                }

                _uiState.update {
                    it.copy(
                        recipientToken = token,
                        tokenSaved = true,
                        tokenError = null
                    )
                }

                // Register FCM push subscription (non-fatal, best-effort)
                registerFcmPush(token)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(tokenError = "保存失败: ${e.message}")
                }
            }
        }
    }

    fun clearTokenSaved() {
        _uiState.update { it.copy(tokenSaved = false) }
    }

    /**
     * Register FCM token for push notifications.
     * This is equivalent to the web frontend's registerPushSubscription().
     */
    private fun registerFcmPush(recipientToken: String) {
        viewModelScope.launch {
            try {
                val fcmToken = FirebaseMessaging.getInstance().token.await()
                api.subscribe(
                    auth = "Bearer $recipientToken",
                    body = SubscribeRequest(
                        endpoint = "fcm://$fcmToken",
                        keys = SubscribeKeys(p256dh = "native-fcm", auth = "native-fcm")
                    )
                )
            } catch (e: Exception) {
                // FCM registration failure is non-fatal — push just won't work
                Log.w("SettingsVM", "FCM push registration failed", e)
            }
        }
    }

    fun clearMessages() {
        viewModelScope.launch {
            try {
                repository.clearAll()
            } catch (e: Exception) {
                Log.e("SettingsVM", "clearMessages failed", e)
            }
        }
    }

    /**
     * Toggle "remember password" setting.
     * When disabled, clears the saved password immediately.
     */
    fun setRememberPassword(enabled: Boolean) {
        viewModelScope.launch(Dispatchers.IO) {
            if (enabled) {
                // Just update the UI state — password will be saved on next unlock
                // (already handled in LockScreen)
            } else {
                keyManager.clearSavedPassword()
            }
        }
        _uiState.update { it.copy(rememberPassword = enabled) }
    }

    fun checkForUpdate() {
        viewModelScope.launch {
            appUpdater.checkForUpdate()
        }
    }

    fun downloadUpdate(info: UpdateInfo) {
        appUpdater.downloadAndInstall(info)
    }
}
