package com.hxhoutiku.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val id: String,
    val title: String,
    val body: String,
    val priority: String,
    @ColumnInfo(name = "group_name") val group: String,
    val timestamp: Long,
    @ColumnInfo(name = "is_read") val isRead: Boolean,
    val tags: String = ""
)
