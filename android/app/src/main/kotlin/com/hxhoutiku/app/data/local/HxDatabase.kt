package com.hxhoutiku.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.hxhoutiku.app.data.local.dao.MessageDao
import com.hxhoutiku.app.data.local.entity.MessageEntity

@Database(
    entities = [MessageEntity::class],
    version = 1,
    exportSchema = false
)
abstract class HxDatabase : RoomDatabase() {
    abstract fun messageDao(): MessageDao
}
