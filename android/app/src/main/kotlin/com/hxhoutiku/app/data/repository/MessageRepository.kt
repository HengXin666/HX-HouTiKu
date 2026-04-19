package com.hxhoutiku.app.data.repository

import android.util.Base64
import com.hxhoutiku.app.crypto.EciesManager
import com.hxhoutiku.app.data.local.dao.MessageDao
import com.hxhoutiku.app.data.local.entity.MessageEntity
import com.hxhoutiku.app.data.remote.HxApi
import com.hxhoutiku.app.data.remote.dto.EncryptedMessageDto
import com.hxhoutiku.app.data.remote.dto.MarkReadRequest
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@JsonClass(generateAdapter = true)
data class DecryptedPayload(
    val title: String,
    val body: String,
    val tags: List<String>? = null
)

@Singleton
class MessageRepository @Inject constructor(
    private val api: HxApi,
    private val messageDao: MessageDao,
    private val moshi: Moshi
) {
    private val payloadAdapter = moshi.adapter(DecryptedPayload::class.java)

    /** Observe messages from local cache as a Flow. */
    fun observeMessages(): Flow<List<MessageEntity>> = messageDao.observeAll()

    /** Observe messages filtered by group. */
    fun observeByGroup(group: String): Flow<List<MessageEntity>> =
        messageDao.observeByGroup(group)

    /** Get total unread count. */
    fun observeUnreadCount(): Flow<Int> = messageDao.observeUnreadCount()

    /** Get all distinct groups. */
    fun observeGroups(): Flow<List<String>> = messageDao.observeGroups()

    /**
     * Fetch messages from the server, decrypt them, and cache locally.
     *
     * @return Number of new messages added
     */
    suspend fun fetchAndDecrypt(
        recipientToken: String,
        privateKeyHex: String,
        since: Long? = null,
        limit: Int = 50
    ): Int = withContext(Dispatchers.IO) {
        val auth = "Bearer $recipientToken"
        val response = api.getMessages(auth, since, limit)

        val entities = response.messages.map { dto ->
            decryptToEntity(dto, privateKeyHex)
        }

        messageDao.insertAll(entities)
        entities.size
    }

    /**
     * Decrypt a single pushed message (from FCM) and cache it.
     */
    suspend fun ingestPushed(
        encryptedData: String,
        messageId: String,
        priority: String,
        group: String,
        timestamp: Long,
        privateKeyHex: String
    ): MessageEntity = withContext(Dispatchers.IO) {
        val dto = EncryptedMessageDto(
            id = messageId,
            encryptedData = encryptedData,
            priority = priority,
            group = group,
            timestamp = timestamp,
            isRead = false
        )
        val entity = decryptToEntity(dto, privateKeyHex)
        messageDao.insert(entity)
        entity
    }

    /** Mark messages as read on both server and local cache. */
    suspend fun markAsRead(
        recipientToken: String,
        messageIds: List<String>
    ) = withContext(Dispatchers.IO) {
        val auth = "Bearer $recipientToken"
        api.markAsRead(auth, MarkReadRequest(messageIds))
        messageDao.markRead(messageIds)
    }

    /** Get a single message by ID. */
    suspend fun getById(id: String): MessageEntity? = messageDao.getById(id)

    /** Clear all cached messages. */
    suspend fun clearAll() = messageDao.deleteAll()

    // --- Internal ---

    private fun decryptToEntity(
        dto: EncryptedMessageDto,
        privateKeyHex: String
    ): MessageEntity {
        return try {
            val ciphertext = Base64.decode(dto.encryptedData, Base64.DEFAULT)
            val plaintext = EciesManager.decrypt(privateKeyHex, ciphertext)
            val payload = payloadAdapter.fromJson(String(plaintext, Charsets.UTF_8))
                ?: throw IllegalStateException("Failed to parse decrypted payload")

            MessageEntity(
                id = dto.id,
                title = payload.title,
                body = payload.body,
                priority = dto.priority,
                group = dto.group,
                timestamp = dto.timestamp,
                isRead = dto.isRead,
                tags = payload.tags?.joinToString(",") ?: ""
            )
        } catch (e: Exception) {
            // Decryption failed — store placeholder
            MessageEntity(
                id = dto.id,
                title = "🔒 解密失败",
                body = "无法解密此消息: ${e.message}",
                priority = dto.priority,
                group = dto.group,
                timestamp = dto.timestamp,
                isRead = dto.isRead,
                tags = ""
            )
        }
    }
}
