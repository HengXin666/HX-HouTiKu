package com.hxhoutiku.app.ui.screen.feed

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.local.entity.MessageEntity
import com.hxhoutiku.app.data.repository.MessageRepository
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
        val privateKey = SessionHolder.privateKeyHex ?: return

        viewModelScope.launch {
            _isRefreshing.value = true
            try {
                repository.fetchAndDecrypt(token, privateKey)
            } catch (e: Exception) {
                Log.w("FeedViewModel", "refresh failed", e)
            } finally {
                _isRefreshing.value = false
            }
        }
    }
}

/**
 * Simple in-memory session holder for the unlocked private key.
 * Lives as a global singleton — the private key is available as long as
 * the app process is alive and the user hasn't locked.
 */
object SessionHolder {
    @Volatile
    var privateKeyHex: String? = null
}
