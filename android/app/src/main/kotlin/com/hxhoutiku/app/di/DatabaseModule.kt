package com.hxhoutiku.app.di

import android.content.Context
import androidx.room.Room
import com.hxhoutiku.app.data.local.HxDatabase
import com.hxhoutiku.app.data.local.dao.MessageDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): HxDatabase =
        Room.databaseBuilder(
            context,
            HxDatabase::class.java,
            "hx_houtiku.db"
        ).build()

    @Provides
    @Singleton
    fun provideMessageDao(db: HxDatabase): MessageDao = db.messageDao()
}
