package com.hxhoutiku.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.ui.screen.feed.SessionHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val keyManager: KeyManager
) : ViewModel() {

    sealed class AuthState {
        data object Loading : AuthState()
        data object NoKeys : AuthState()
        data object Locked : AuthState()
        data class Unlocked(val privateKeyHex: String) : AuthState()
    }

    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state

    init {
        checkState()
    }

    private fun checkState() {
        _state.value = when {
            !keyManager.hasKeys() -> AuthState.NoKeys
            else -> AuthState.Locked
        }
    }

    fun unlock(password: String): Boolean {
        val privateKey = keyManager.unlock(password)
        return if (privateKey != null) {
            SessionHolder.privateKeyHex = privateKey
            _state.value = AuthState.Unlocked(privateKey)
            true
        } else {
            false
        }
    }

    fun lock() {
        SessionHolder.privateKeyHex = null
        _state.value = AuthState.Locked
    }

    fun reset() {
        SessionHolder.privateKeyHex = null
        keyManager.clear()
        _state.value = AuthState.NoKeys
    }

    fun getPrivateKeyHex(): String? {
        val s = _state.value
        return if (s is AuthState.Unlocked) s.privateKeyHex else null
    }

    fun getRecipientToken(): String? = keyManager.getRecipientToken()

    /**
     * Called after setup completes to update auth state to Unlocked.
     * At this point SessionHolder.privateKeyHex is already set by SetupViewModel.
     */
    fun notifySetupComplete() {
        val privateKey = SessionHolder.privateKeyHex
        if (privateKey != null) {
            _state.value = AuthState.Unlocked(privateKey)
        } else {
            // Fallback: at least mark as Locked so we don't loop back to Setup
            _state.value = AuthState.Locked
        }
    }
}
