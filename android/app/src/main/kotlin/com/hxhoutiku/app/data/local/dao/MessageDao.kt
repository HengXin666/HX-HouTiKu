package com.hxhoutiku.app.data.local.dao

import androidx.room.*
import com.hxhoutiku.app.data.local.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    @Query("SELECT * FROM messages ORDER BY timestamp DESC")
    fun observeAll(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE group_name = :group ORDER BY timestamp DESC")
    fun observeByGroup(group: String): Flow<List<MessageEntity>>

    @Query("SELECT COUNT(*) FROM messages WHERE is_read = 0")
    fun observeUnreadCount(): Flow<Int>

    @Query("SELECT DISTINCT group_name FROM messages ORDER BY group_name")
    fun observeGroups(): Flow<List<String>>

    @Query("SELECT * FROM messages WHERE id = :id")
    suspend fun getById(id: String): MessageEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<MessageEntity>)

    @Query("UPDATE messages SET is_read = 1 WHERE id IN (:ids)")
    suspend fun markRead(ids: List<String>)

    @Query("DELETE FROM messages")
    suspend fun deleteAll()

    @Query("DELETE FROM messages WHERE timestamp < :before AND is_read = 1")
    suspend fun deleteOldRead(before: Long)
}
