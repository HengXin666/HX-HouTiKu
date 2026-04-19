package com.hxhoutiku.app.ui.screen.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.ui.screen.feed.SessionHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class SetupUiState(
    val step: Int = 1, // 1=welcome/password, 2=export public key, 3=done
    val deviceName: String = "",
    val password: String = "",
    val passwordConfirm: String = "",
    val publicKey: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val copied: Boolean = false
)

/**
 * Setup flow — matches the web frontend's SetupWizard exactly:
 *
 * Step 1: Set device name + master password
 * Step 2: Generate key pair (locally, no network), show public key for user to copy
 * Step 3: Done — user enters app, configures recipient token in Settings later
 *
 * NO API calls here. Registration (POST /api/recipients) requires ADMIN_TOKEN
 * and is done externally (e.g. via SDK/CLI). The user then pastes the returned
 * recipient_token into Settings, just like the web frontend does.
 */
@HiltViewModel
class SetupViewModel @Inject constructor(
    private val keyManager: KeyManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState

    fun setDeviceName(value: String) = _uiState.update { it.copy(deviceName = value) }
    fun setPassword(value: String) = _uiState.update { it.copy(password = value, error = null) }
    fun setPasswordConfirm(value: String) = _uiState.update { it.copy(passwordConfirm = value, error = null) }

    /**
     * Generate key pair asynchronously. PBKDF2 (600k iterations) runs on Dispatchers.Default.
     * Equivalent to web frontend's auth-store.ts generateKeys().
     *
     * Flow: generateKeyPair() → wrapPrivateKey(password) → save to EncryptedSharedPreferences
     * No network calls involved.
     */
    fun generateKeys() {
        val state = _uiState.value

        if (state.password.length < 8) {
            _uiState.update { it.copy(error = "密码至少 8 位") }
            return
        }
        if (state.password != state.passwordConfirm) {
            _uiState.update { it.copy(error = "两次密码不一致") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val (publicKey, privateKey) = withContext(Dispatchers.Default) {
                    val pubKey = keyManager.generateAndStore(state.password)
                    val privKey = keyManager.unlock(state.password)
                    Pair(pubKey, privKey)
                }

                if (privateKey != null) {
                    SessionHolder.privateKeyHex = privateKey
                }

                // Save device name
                withContext(Dispatchers.IO) {
                    keyManager.saveDeviceName(state.deviceName.ifBlank { "android" })
                }

                _uiState.update {
                    it.copy(step = 2, publicKey = publicKey, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = "密钥生成失败: ${e.message}")
                }
            }
        }
    }

    fun setCopied(value: Boolean) {
        _uiState.update { it.copy(copied = value) }
    }
}
