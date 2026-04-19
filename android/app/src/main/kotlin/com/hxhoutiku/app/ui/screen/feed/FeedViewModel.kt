package com.hxhoutiku.app.ui.screen.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.local.entity.MessageEntity
import com.hxhoutiku.app.data.repository.MessageRepository
import com.hxhoutiku.app.ui.viewmodel.AuthViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class FeedViewModel @Inject constructor(
    private val repository: MessageRepository,
    private val keyManager: KeyManager
) : ViewModel() {

    private val _groupFilter = MutableStateFlow<String?>(null)
    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing

    val messages: Flow<List<MessageEntity>> = _groupFilter.flatMapLatest { group ->
        if (group != null) repository.observeByGroup(group)
        else repository.observeMessages()
    }

    val unreadCount: Flow<Int> = repository.observeUnreadCount()

    fun setGroupFilter(group: String?) {
        _groupFilter.value = group
    }

    fun refresh() {
        val token = keyManager.getRecipientToken() ?: return
        // We need the private key from somewhere — in a real app this would
        // come from the auth state. For now we'll attempt to use a cached key
        // via a shared mechanism.
        viewModelScope.launch {
            _isRefreshing.value = true
            try {
                // Get private key from session holder
                val privateKey = SessionHolder.privateKeyHex
                if (privateKey != null) {
                    repository.fetchAndDecrypt(token, privateKey)
                }
            } catch (e: Exception) {
                // TODO: expose error to UI
            } finally {
                _isRefreshing.value = false
            }
        }
    }
}

/**
 * Simple in-memory session holder for the unlocked private key.
 * In production, consider a more robust approach.
 */
object SessionHolder {
    var privateKeyHex: String? = null
}
