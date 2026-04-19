package com.hxhoutiku.app.ui.screen.settings

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.repository.MessageRepository
import com.hxhoutiku.app.di.ApiBaseProvider
import com.hxhoutiku.app.updater.AppUpdater
import com.hxhoutiku.app.updater.UpdateInfo
import com.hxhoutiku.app.updater.UpdateState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val recipientName: String = "",
    val publicKey: String = "",
    val apiBase: String = "",
    val appVersion: String = ""
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val keyManager: KeyManager,
    private val repository: MessageRepository,
    private val apiBaseProvider: ApiBaseProvider,
    val appUpdater: AppUpdater
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState

    val updateState: StateFlow<UpdateState> = appUpdater.state

    init {
        try {
            _uiState.value = SettingsUiState(
                recipientName = keyManager.getRecipientName() ?: "未注册",
                publicKey = keyManager.getPublicKey() ?: "",
                apiBase = apiBaseProvider.getBaseUrl(),
                appVersion = com.hxhoutiku.app.BuildConfig.VERSION_NAME
            )
        } catch (e: Exception) {
            Log.e("SettingsVM", "init failed", e)
            _uiState.value = SettingsUiState(
                recipientName = "加载失败",
                publicKey = "",
                apiBase = "未知",
                appVersion = "未知"
            )
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

    fun checkForUpdate() {
        viewModelScope.launch {
            appUpdater.checkForUpdate()
        }
    }

    fun downloadUpdate(info: UpdateInfo) {
        appUpdater.downloadAndInstall(info)
    }
}
