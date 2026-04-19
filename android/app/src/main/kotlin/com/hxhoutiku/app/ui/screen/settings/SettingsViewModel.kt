package com.hxhoutiku.app.ui.screen.settings

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
        _uiState.value = SettingsUiState(
            recipientName = keyManager.getRecipientName() ?: "未注册",
            publicKey = keyManager.getPublicKey() ?: "",
            apiBase = apiBaseProvider.getBaseUrl(),
            appVersion = com.hxhoutiku.app.BuildConfig.VERSION_NAME
        )
    }

    fun clearMessages() {
        viewModelScope.launch {
            repository.clearAll()
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
