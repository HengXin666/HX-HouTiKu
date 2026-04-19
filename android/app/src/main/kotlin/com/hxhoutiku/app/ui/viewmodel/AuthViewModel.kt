package com.hxhoutiku.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.ui.screen.feed.SessionHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val keyManager: KeyManager
) : ViewModel() {

    sealed class AuthState {
        data object Loading : AuthState()
        data object NoKeys : AuthState()
        data object Locked : AuthState()
        data object Unlocked : AuthState()
    }

    /** One-shot navigation events to avoid startDestination races. */
    sealed class NavEvent {
        data object GoToFeed : NavEvent()
        data object GoToSetup : NavEvent()
        data object GoToLock : NavEvent()
    }

    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state

    private val _navEvent = MutableSharedFlow<NavEvent>(extraBufferCapacity = 1)
    val navEvent: SharedFlow<NavEvent> = _navEvent

    init {
        viewModelScope.launch {
            checkState()
        }
    }

    private suspend fun checkState() {
        // hasKeys() reads EncryptedSharedPreferences — do off main thread
        val hasKeys = withContext(Dispatchers.IO) {
            try {
                keyManager.hasKeys()
            } catch (_: Exception) {
                false
            }
        }
        _state.value = if (hasKeys) AuthState.Locked else AuthState.NoKeys
    }

    /**
     * Attempt to unlock with password. Runs PBKDF2 off the main thread.
     * Returns true on success.
     */
    suspend fun unlock(password: String): Boolean {
        val privateKey = withContext(Dispatchers.Default) {
            keyManager.unlock(password)
        }
        return if (privateKey != null) {
            SessionHolder.privateKeyHex = privateKey
            _state.value = AuthState.Unlocked
            true
        } else {
            false
        }
    }

    fun lock() {
        SessionHolder.privateKeyHex = null
        _state.value = AuthState.Locked
        _navEvent.tryEmit(NavEvent.GoToLock)
    }

    fun reset() {
        SessionHolder.privateKeyHex = null
        viewModelScope.launch(Dispatchers.IO) {
            keyManager.clear()
        }
        _state.value = AuthState.NoKeys
        _navEvent.tryEmit(NavEvent.GoToSetup)
    }

    /**
     * Called after setup completes. SessionHolder.privateKeyHex is already set.
     */
    fun notifySetupComplete() {
        _state.value = AuthState.Unlocked
        _navEvent.tryEmit(NavEvent.GoToFeed)
    }

    fun getRecipientToken(): String? = keyManager.getRecipientToken()
}
