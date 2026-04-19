package com.hxhoutiku.app.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

// --- Config ---

@JsonClass(generateAdapter = true)
data class ConfigResponse(
    @Json(name = "vapid_public_key") val vapidPublicKey: String,
    val version: String,
    @Json(name = "encryption_curve") val encryptionCurve: String
)

// --- Messages ---

@JsonClass(generateAdapter = true)
data class EncryptedMessageDto(
    val id: String,
    @Json(name = "encrypted_data") val encryptedData: String,
    val priority: String,
    @Json(name = "content_type") val contentType: String = "markdown",
    val group: String,
    val timestamp: Long,
    @Json(name = "is_read") val isRead: Boolean
)

@JsonClass(generateAdapter = true)
data class MessagesResponse(
    val messages: List<EncryptedMessageDto>,
    @Json(name = "total_unread") val totalUnread: Int,
    @Json(name = "has_more") val hasMore: Boolean
)

@JsonClass(generateAdapter = true)
data class MarkReadRequest(
    @Json(name = "message_ids") val messageIds: List<String>
)

@JsonClass(generateAdapter = true)
data class MarkReadResponse(
    val updated: Int
)

// --- Recipients ---

@JsonClass(generateAdapter = true)
data class RegisterRecipientRequest(
    val name: String,
    @Json(name = "public_key") val publicKey: String,
    val groups: List<String> = listOf("general")
)

@JsonClass(generateAdapter = true)
data class RegisterRecipientResponse(
    val id: String,
    @Json(name = "recipient_token") val recipientToken: String,
    val name: String
)

@JsonClass(generateAdapter = true)
data class RecipientDto(
    val id: String,
    val name: String,
    @Json(name = "public_key") val publicKey: String,
    val groups: String,
    @Json(name = "is_active") val isActive: Boolean
)

// --- Subscribe (FCM) ---

@JsonClass(generateAdapter = true)
data class SubscribeRequest(
    val endpoint: String,
    val keys: SubscribeKeys
)

@JsonClass(generateAdapter = true)
data class SubscribeKeys(
    val p256dh: String,
    val auth: String
)

@JsonClass(generateAdapter = true)
data class SubscribeResponse(
    val status: String
)

// --- Generic ---

@JsonClass(generateAdapter = true)
data class ErrorResponse(
    val error: String
)

@JsonClass(generateAdapter = true)
data class HealthResponse(
    val name: String,
    val version: String,
    val status: String
)
