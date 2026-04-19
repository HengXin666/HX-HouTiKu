package com.hxhoutiku.app.ui.screen.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hxhoutiku.app.crypto.KeyManager
import com.hxhoutiku.app.data.local.entity.MessageEntity
import com.hxhoutiku.app.data.repository.MessageRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MessageDetailViewModel @Inject constructor(
    private val repository: MessageRepository,
    private val keyManager: KeyManager
) : ViewModel() {

    private val _message = MutableStateFlow<MessageEntity?>(null)
    val message: StateFlow<MessageEntity?> = _message

    fun loadMessage(id: String) {
        viewModelScope.launch {
            val msg = repository.getById(id)
            _message.value = msg

            // Mark as read
            if (msg != null && !msg.isRead) {
                val token = keyManager.getRecipientToken()
                if (token != null) {
                    try {
                        repository.markAsRead(token, listOf(id))
                    } catch (_: Exception) {
                        // Non-fatal — still show the message
                    }
                }
            }
        }
    }
}
