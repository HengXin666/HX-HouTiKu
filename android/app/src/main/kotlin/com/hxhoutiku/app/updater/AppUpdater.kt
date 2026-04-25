package com.hxhoutiku.app.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.URL

/**
 * 检查 GitHub Releases 获取最新版本信息。
 * 使用 GitHub REST API (无需认证, 公开仓库免费额度 60次/小时/IP)。
 * 参考: https://docs.github.com/en/rest/releases/releases#get-the-latest-release
 */
object AppUpdater {

    private const val TAG = "AppUpdater"
    private const val GITHUB_OWNER = "HengXin666"
    private const val GITHUB_REPO = "HX-HouTiKu"
    private const val RELEASES_URL = "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/releases"
    private const val PREF_SKIP_VERSION = "skip_update_version"
    private const val PREF_LAST_CHECK = "last_update_check"
    private const val CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000L // 4小时

    data class UpdateInfo(
        val versionName: String,
        val downloadUrl: String,
        val releaseNotes: String,
        val htmlUrl: String,
    )

    /**
     * 检查是否有新版本可用。
     * 返回 null 表示已是最新或检查失败。
     */
    suspend fun checkForUpdate(context: Context, currentVersion: String): UpdateInfo? {
        val prefs = context.getSharedPreferences("hx_settings", Context.MODE_PRIVATE)

        // 节流: 4小时内不重复检查
        val lastCheck = prefs.getLong(PREF_LAST_CHECK, 0)
        if (System.currentTimeMillis() - lastCheck < CHECK_INTERVAL_MS) {
            Log.d(TAG, "Skipping update check (throttled)")
            return null
        }

        return withContext(Dispatchers.IO) {
            try {
                prefs.edit().putLong(PREF_LAST_CHECK, System.currentTimeMillis()).apply()

                val conn = URL("$RELEASES_URL?per_page=1").openConnection()
                conn.setRequestProperty("Accept", "application/vnd.github+json")
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000

                val json = conn.getInputStream().bufferedReader().readText()
                val releases = JSONArray(json)
                if (releases.length() == 0) return@withContext null

                val latest = releases.getJSONObject(0)
                val tagName = latest.optString("tag_name", "")
                val latestVersion = tagName.removePrefix("v")
                val releaseNotes = latest.optString("body", "")
                val htmlUrl = latest.optString("html_url", "")

                if (!isNewerVersion(currentVersion, latestVersion)) {
                    Log.d(TAG, "Already up to date: $currentVersion >= $latestVersion")
                    return@withContext null
                }

                // 用户选择跳过此版本
                val skipVersion = prefs.getString(PREF_SKIP_VERSION, null)
                if (skipVersion == latestVersion) {
                    Log.d(TAG, "User skipped version $latestVersion")
                    return@withContext null
                }

                // 查找 APK 下载链接
                val assets = latest.optJSONArray("assets")
                var apkUrl = ""
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        val name = asset.optString("name", "")
                        if (name.endsWith(".apk")) {
                            apkUrl = asset.optString("browser_download_url", "")
                            break
                        }
                    }
                }

                if (apkUrl.isBlank()) {
                    Log.w(TAG, "No APK found in release $latestVersion")
                    return@withContext null
                }

                Log.i(TAG, "New version available: $latestVersion (current: $currentVersion)")
                UpdateInfo(latestVersion, apkUrl, releaseNotes, htmlUrl)
            } catch (e: Exception) {
                Log.w(TAG, "Update check failed", e)
                null
            }
        }
    }

    /** 记录用户选择跳过某个版本 */
    fun skipVersion(context: Context, version: String) {
        context.getSharedPreferences("hx_settings", Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_SKIP_VERSION, version)
            .apply()
    }

    /** 打开浏览器下载 APK */
    fun openDownload(context: Context, url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open download URL", e)
        }
    }

    /**
     * 简单的语义化版本比较: "3.0.0" < "3.1.0"
     */
    private fun isNewerVersion(current: String, latest: String): Boolean {
        val c = current.split(".").mapNotNull { it.toIntOrNull() }
        val l = latest.split(".").mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(c.size, l.size)) {
            val cv = c.getOrElse(i) { 0 }
            val lv = l.getOrElse(i) { 0 }
            if (lv > cv) return true
            if (lv < cv) return false
        }
        return false
    }
}
