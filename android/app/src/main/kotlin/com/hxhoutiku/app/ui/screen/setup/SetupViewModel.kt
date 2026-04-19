package com.hxhoutiku.app.ui.screen.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.remote.HxApi
import com.hxhoutiku.app.data.remote.dto.RegisterRecipientRequest
import com.hxhoutiku.app.data.remote.dto.SubscribeKeys
import com.hxhoutiku.app.data.remote.dto.SubscribeRequest
import com.hxhoutiku.app.ui.screen.feed.SessionHolder
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

data class SetupUiState(
    val step: Int = 1,
    val password: String = "",
    val passwordConfirm: String = "",
    val publicKey: String = "",
    val recipientName: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class SetupViewModel @Inject constructor(
    private val keyManager: KeyManager,
    private val api: HxApi
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState

    fun setPassword(value: String) = _uiState.update { it.copy(password = value) }
    fun setPasswordConfirm(value: String) = _uiState.update { it.copy(passwordConfirm = value) }
    fun setRecipientName(value: String) = _uiState.update { it.copy(recipientName = value) }

    /**
     * Generate keys asynchronously. PBKDF2 (600k iterations) runs on Dispatchers.Default.
     */
    fun generateKeys() {
        val state = _uiState.value
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

    fun register(onComplete: () -> Unit) {
        val state = _uiState.value
        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val response = api.registerRecipient(
                    body = RegisterRecipientRequest(
                        name = state.recipientName,
                        publicKey = state.publicKey,
                        groups = listOf("general")
                    )
                )

                withContext(Dispatchers.IO) {
                    keyManager.saveRecipientInfo(response.recipientToken, response.name)
                }

                // Register FCM token for push notifications (non-fatal)
                try {
                    val fcmToken = FirebaseMessaging.getInstance().token.await()
                    api.subscribe(
                        auth = "Bearer ${response.recipientToken}",
                        body = SubscribeRequest(
                            endpoint = "fcm://$fcmToken",
                            keys = SubscribeKeys(p256dh = "native-fcm", auth = "native-fcm")
                        )
                    )
                } catch (_: Exception) {
                    // FCM registration failure is non-fatal
                }

                _uiState.update { it.copy(isLoading = false) }
                onComplete()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = "注册失败: ${e.message}")
                }
            }
        }
    }
}
