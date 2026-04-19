package com.hxhoutiku.app.ui.screen.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.hxhoutiku.app.updater.UpdateState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLock: () -> Unit,
    onReset: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val updateState by viewModel.updateState.collectAsState()
    var showResetDialog by remember { mutableStateOf(false) }
    var showUpdateDialog by remember { mutableStateOf(false) }

    // 监听更新状态变化
    LaunchedEffect(updateState) {
        if (updateState is UpdateState.Available) {
            showUpdateDialog = true
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设置") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
        ) {
            // Device info section
            ListItem(
                headlineContent = { Text("设备名称") },
                supportingContent = { Text(uiState.recipientName) },
                leadingContent = { Icon(Icons.Default.Smartphone, null) }
            )

            ListItem(
                headlineContent = { Text("公钥") },
                supportingContent = {
                    Text(
                        uiState.publicKey.take(24) + "...",
                        fontFamily = FontFamily.Monospace
                    )
                },
                leadingContent = { Icon(Icons.Default.Key, null) }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // API section
            ListItem(
                headlineContent = { Text("API 地址") },
                supportingContent = { Text(uiState.apiBase) },
                leadingContent = { Icon(Icons.Default.Cloud, null) }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Update section
            UpdateSection(
                updateState = updateState,
                onCheckUpdate = { viewModel.checkForUpdate() }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Actions
            ListItem(
                headlineContent = { Text("锁定") },
                supportingContent = { Text("锁定应用，需要重新输入密码") },
                leadingContent = { Icon(Icons.Default.Lock, null) },
                modifier = Modifier.clickable { onLock() }
            )

            ListItem(
                headlineContent = { Text("清除本地消息") },
                supportingContent = { Text("删除本地缓存的所有消息") },
                leadingContent = { Icon(Icons.Default.DeleteSweep, null) },
                modifier = Modifier.clickable { viewModel.clearMessages() }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Danger zone
            ListItem(
                headlineContent = {
                    Text("重置", color = MaterialTheme.colorScheme.error)
                },
                supportingContent = {
                    Text("删除密钥和所有数据，重新开始")
                },
                leadingContent = {
                    Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error)
                },
                modifier = Modifier.clickable { showResetDialog = true }
            )

            Spacer(Modifier.height(32.dp))

            // Version info
            Text(
                "HX-HouTiKu Android v${uiState.appVersion}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
    }

    // Reset confirmation dialog
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("确认重置") },
            text = { Text("这将删除本地密钥和所有数据。此操作不可撤销！") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showResetDialog = false
                        onReset()
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("重置")
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("取消")
                }
            }
        )
    }

    // Update available dialog
    if (showUpdateDialog && updateState is UpdateState.Available) {
        val info = (updateState as UpdateState.Available).info
        AlertDialog(
            onDismissRequest = { showUpdateDialog = false },
            icon = { Icon(Icons.Default.SystemUpdate, null) },
            title = { Text("发现新版本 v${info.versionName}") },
            text = {
                Column {
                    if (!info.releaseNotes.isNullOrBlank()) {
                        Text(
                            info.releaseNotes,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.heightIn(max = 200.dp)
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(
                        "文件大小: ${formatFileSize(info.fileSize)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    showUpdateDialog = false
                    viewModel.downloadUpdate(info)
                }) {
                    Text("下载更新")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUpdateDialog = false }) {
                    Text("稍后再说")
                }
            }
        )
    }
}

@Composable
private fun UpdateSection(
    updateState: UpdateState,
    onCheckUpdate: () -> Unit
) {
    when (updateState) {
        is UpdateState.Idle -> {
            ListItem(
                headlineContent = { Text("检查更新") },
                supportingContent = { Text("点击检查是否有新版本") },
                leadingContent = { Icon(Icons.Default.SystemUpdate, null) },
                modifier = Modifier.clickable { onCheckUpdate() }
            )
        }
        is UpdateState.Checking -> {
            ListItem(
                headlineContent = { Text("正在检查更新...") },
                leadingContent = {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                }
            )
        }
        is UpdateState.Available -> {
            val info = updateState.info
            ListItem(
                headlineContent = {
                    Text("有新版本: v${info.versionName}", color = MaterialTheme.colorScheme.primary)
                },
                supportingContent = { Text("点击查看详情") },
                leadingContent = {
                    Icon(Icons.Default.NewReleases, null, tint = MaterialTheme.colorScheme.primary)
                },
                modifier = Modifier.clickable { /* dialog handled by LaunchedEffect */ }
            )
        }
        is UpdateState.Downloading -> {
            ListItem(
                headlineContent = { Text("正在下载更新...") },
                supportingContent = {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                    )
                },
                leadingContent = { Icon(Icons.Default.Download, null) }
            )
        }
        is UpdateState.Installing -> {
            ListItem(
                headlineContent = { Text("正在安装...") },
                supportingContent = { Text("请在弹出的系统安装界面中确认") },
                leadingContent = { Icon(Icons.Default.InstallMobile, null) }
            )
        }
        is UpdateState.UpToDate -> {
            ListItem(
                headlineContent = { Text("已是最新版本") },
                supportingContent = { Text("点击重新检查") },
                leadingContent = {
                    Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.primary)
                },
                modifier = Modifier.clickable { onCheckUpdate() }
            )
        }
        is UpdateState.Error -> {
            ListItem(
                headlineContent = {
                    Text("检查更新失败", color = MaterialTheme.colorScheme.error)
                },
                supportingContent = { Text(updateState.message + "\n点击重试") },
                leadingContent = {
                    Icon(Icons.Default.ErrorOutline, null, tint = MaterialTheme.colorScheme.error)
                },
                modifier = Modifier.clickable { onCheckUpdate() }
            )
        }
    }
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes >= 1_048_576 -> "%.1f MB".format(bytes / 1_048_576.0)
        bytes >= 1024 -> "%.0f KB".format(bytes / 1024.0)
        else -> "$bytes B"
    }
}
