package com.hxhoutiku.app.di

import android.content.Context
import com.hxhoutiku.app.BuildConfig
import com.hxhoutiku.app.data.remote.HxApi
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        if (BuildConfig.DEBUG) {
            builder.addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BODY
                }
            )
        }

        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        moshi: Moshi,
        apiBaseProvider: ApiBaseProvider
    ): Retrofit = Retrofit.Builder()
        .baseUrl(apiBaseProvider.getBaseUrl())
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    @Provides
    @Singleton
    fun provideHxApi(retrofit: Retrofit): HxApi =
        retrofit.create(HxApi::class.java)

    @Provides
    @Singleton
    fun provideApiBaseProvider(@ApplicationContext context: Context): ApiBaseProvider =
        ApiBaseProvider(context)
}

/**
 * Provides the API base URL from:
 * 1. SharedPreferences (user-configured)
 * 2. BuildConfig (compile-time)
 * 3. Fallback empty string (will fail at runtime, forcing user to configure)
 */
class ApiBaseProvider(private val context: Context) {
    private val prefs = context.getSharedPreferences("hx_settings", Context.MODE_PRIVATE)

    fun getBaseUrl(): String {
        val stored = prefs.getString("api_base", null)
        if (!stored.isNullOrBlank()) return ensureTrailingSlash(stored)
        val buildConfig = BuildConfig.API_BASE
        if (buildConfig.isNotBlank()) return ensureTrailingSlash(buildConfig)
        // Return a placeholder that forces configuration
        return "https://configure-me.workers.dev/"
    }

    fun setBaseUrl(url: String) {
        prefs.edit().putString("api_base", url).apply()
    }

    private fun ensureTrailingSlash(url: String): String =
        if (url.endsWith("/")) url else "$url/"
}
