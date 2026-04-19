package com.hxhoutiku.app.updater

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@JsonClass(generateAdapter = true)
data class GitHubRelease(
    @Json(name = "tag_name") val tagName: String,
    @Json(name = "name") val name: String,
    @Json(name = "body") val body: String?,
    @Json(name = "html_url") val htmlUrl: String,
    @Json(name = "assets") val assets: List<GitHubAsset>,
    @Json(name = "prerelease") val prerelease: Boolean
)

@JsonClass(generateAdapter = true)
data class GitHubAsset(
    @Json(name = "name") val name: String,
    @Json(name = "browser_download_url") val downloadUrl: String,
    @Json(name = "size") val size: Long
)

data class UpdateInfo(
    val versionName: String,
    val releaseNotes: String?,
    val downloadUrl: String,
    val fileSize: Long,
    val htmlUrl: String
)

sealed class UpdateState {
    data object Idle : UpdateState()
    data object Checking : UpdateState()
    data class Available(val info: UpdateInfo) : UpdateState()
    data class Downloading(val progress: Int) : UpdateState()
    data object Installing : UpdateState()
    data object UpToDate : UpdateState()
    data class Error(val message: String) : UpdateState()
}

@Singleton
class AppUpdater @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val moshi: Moshi
) {
    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state

    private var downloadId: Long = -1

    companion object {
        private const val GITHUB_OWNER = "Ayndpa"
        private const val GITHUB_REPO = "HX-HouTiKu"
        private const val RELEASES_URL =
            "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases/latest"
    }

    suspend fun checkForUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        _state.value = UpdateState.Checking
        try {
            val request = Request.Builder()
                .url(RELEASES_URL)
                .header("Accept", "application/vnd.github.v3+json")
                .build()

            val response = okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                _state.value = UpdateState.Error("检查更新失败: HTTP ${response.code}")
                return@withContext null
            }

            val body = response.body?.string() ?: run {
                _state.value = UpdateState.Error("空响应")
                return@withContext null
            }

            val adapter = moshi.adapter(GitHubRelease::class.java)
            val release = adapter.fromJson(body) ?: run {
                _state.value = UpdateState.Error("解析失败")
                return@withContext null
            }

            if (release.prerelease) {
                _state.value = UpdateState.UpToDate
                return@withContext null
            }

            val remoteVersion = release.tagName.removePrefix("v")
            val currentVersion = getCurrentVersion()

            if (!isNewerVersion(remoteVersion, currentVersion)) {
                _state.value = UpdateState.UpToDate
                return@withContext null
            }

            // 找到 APK 资产（优先 release，否则 debug）
            val apkAsset = release.assets.firstOrNull {
                it.name.endsWith(".apk") && it.name.contains("release")
            } ?: release.assets.firstOrNull {
                it.name.endsWith(".apk")
            }

            if (apkAsset == null) {
                _state.value = UpdateState.Error("新版本无 APK 可下载")
                return@withContext null
            }

            val updateInfo = UpdateInfo(
                versionName = remoteVersion,
                releaseNotes = release.body,
                downloadUrl = apkAsset.downloadUrl,
                fileSize = apkAsset.size,
                htmlUrl = release.htmlUrl
            )

            _state.value = UpdateState.Available(updateInfo)
            updateInfo
        } catch (e: Exception) {
            _state.value = UpdateState.Error("检查更新失败: ${e.localizedMessage}")
            null
        }
    }

    fun downloadAndInstall(updateInfo: UpdateInfo) {
        _state.value = UpdateState.Downloading(0)

        // 清理旧 APK
        val apkDir = File(
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            "updates"
        )
        apkDir.mkdirs()
        apkDir.listFiles()?.forEach { it.delete() }

        val fileName = "hx-houtiku-${updateInfo.versionName}.apk"

        val downloadManager =
            context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

        val request = DownloadManager.Request(Uri.parse(updateInfo.downloadUrl))
            .setTitle("HX-HouTiKu 更新 v${updateInfo.versionName}")
            .setDescription("正在下载新版本...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                "updates/$fileName"
            )
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        downloadId = downloadManager.enqueue(request)

        // 注册下载完成广播
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id == downloadId) {
                    context.unregisterReceiver(this)
                    installApk(File(apkDir, fileName))
                }
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    private fun installApk(apkFile: File) {
        _state.value = UpdateState.Installing

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        context.startActivity(intent)
        _state.value = UpdateState.Idle
    }

    private fun getCurrentVersion(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "0.0.0"
        } catch (_: Exception) {
            "0.0.0"
        }
    }

    /**
     * 比较语义化版本号 a > b
     */
    private fun isNewerVersion(remote: String, current: String): Boolean {
        val remoteParts = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }

        for (i in 0 until maxOf(remoteParts.size, currentParts.size)) {
            val r = remoteParts.getOrElse(i) { 0 }
            val c = currentParts.getOrElse(i) { 0 }
            if (r > c) return true
            if (r < c) return false
        }
        return false
    }

    fun resetState() {
        _state.value = UpdateState.Idle
    }
}
