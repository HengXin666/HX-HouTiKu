package com.hxhoutiku.app.ui.screen.setup

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * Setup wizard — matches the web frontend's SetupWizard.tsx exactly.
 *
 * Flow:
 *   Step 1: Device name + master password → generate key pair (local only, no network)
 *   Step 2: Show public key → user copies it to configure their push SDK
 *   Step 3: Done → enter app
 *
 * After setup, the user configures their Recipient Token in Settings.
 * The token comes from externally registering the public key via the admin API
 * (POST /api/recipients with ADMIN_TOKEN), NOT from the app itself.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(
    onSetupComplete: () -> Unit,
    viewModel: SetupViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设置向导") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Progress indicator
            LinearProgressIndicator(
                progress = { uiState.step / 3f },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))

            when (uiState.step) {
                1 -> StepPasswordAndName(viewModel, uiState)
                2 -> StepExportKey(viewModel, uiState, onSetupComplete)
            }
        }
    }
}

@Composable
private fun StepPasswordAndName(viewModel: SetupViewModel, state: SetupUiState) {
    var showPassword by remember { mutableStateOf(false) }

    // Welcome header
    Icon(
        Icons.Default.Shield,
        contentDescription = null,
        modifier = Modifier.size(48.dp),
        tint = MaterialTheme.colorScheme.primary
    )

    Text("欢迎使用 HX-HouTiKu", style = MaterialTheme.typography.headlineSmall)
    Text(
        "端到端加密的统一消息推送平台\n你的消息，只有你能看",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    Spacer(Modifier.height(8.dp))

    // Device name (optional, like web frontend)
    OutlinedTextField(
        value = state.deviceName,
        onValueChange = viewModel::setDeviceName,
        label = { Text("设备名称（可选）") },
        placeholder = { Text("例如 my-phone") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        enabled = !state.isLoading,
        leadingIcon = { Icon(Icons.Default.Smartphone, null) }
    )
    Text(
        "为这台设备取个名字，方便你以后在多设备间区分",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

    // Password section
    Text("创建主密码", style = MaterialTheme.typography.titleMedium)

    // Tip
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
        )
    ) {
        Row(modifier = Modifier.padding(12.dp)) {
            Text("🔐", modifier = Modifier.padding(end = 8.dp))
            Text(
                "主密码用于保护你的加密私钥。每次打开 App 时需要输入（也可以选择记住密码跳过）。请设一个你记得住的密码。",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }

    OutlinedTextField(
        value = state.password,
        onValueChange = viewModel::setPassword,
        label = { Text("主密码") },
        placeholder = { Text("至少 8 个字符") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        enabled = !state.isLoading,
        visualTransformation = if (showPassword) VisualTransformation.None
        else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = { showPassword = !showPassword }) {
                Icon(
                    if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                    contentDescription = null
                )
            }
        }
    )

    // Password strength
    if (state.password.isNotEmpty()) {
        val strength = getPasswordStrength(state.password)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            repeat(4) { level ->
                LinearProgressIndicator(
                    progress = { if (strength > level) 1f else 0f },
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp),
                    color = when {
                        strength <= 1 -> MaterialTheme.colorScheme.error
                        strength <= 2 -> MaterialTheme.colorScheme.tertiary
                        else -> MaterialTheme.colorScheme.primary
                    }
                )
            }
            Spacer(Modifier.width(8.dp))
            Text(
                when {
                    strength <= 1 -> "弱"
                    strength <= 2 -> "一般"
                    strength <= 3 -> "强"
                    else -> "非常强"
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    if (state.password.length in 1..7) {
        Text(
            "密码至少需要 8 个字符",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }

    OutlinedTextField(
        value = state.passwordConfirm,
        onValueChange = viewModel::setPasswordConfirm,
        label = { Text("确认密码") },
        placeholder = { Text("再输入一次") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        enabled = !state.isLoading,
        visualTransformation = PasswordVisualTransformation(),
        isError = state.passwordConfirm.isNotEmpty() && state.password != state.passwordConfirm
    )

    if (state.error != null) {
        Text(
            state.error,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }

    Button(
        onClick = viewModel::generateKeys,
        modifier = Modifier.fillMaxWidth(),
        enabled = state.password.length >= 8
                && state.password == state.passwordConfirm
                && !state.isLoading
    ) {
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
            )
            Spacer(Modifier.width(8.dp))
            Text("正在生成密钥…")
        } else {
            Icon(Icons.Default.Key, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("生成密钥对")
        }
    }
}

/**
 * Step 2: Show the generated public key for the user to copy.
 * This matches the web frontend's "export" step exactly.
 *
 * The user copies this public key and uses it to register via the admin SDK/CLI.
 * The admin API returns a recipient_token, which the user pastes into Settings.
 */
@Composable
private fun StepExportKey(
    viewModel: SetupViewModel,
    state: SetupUiState,
    onSetupComplete: () -> Unit
) {
    val context = LocalContext.current

    Icon(
        Icons.Default.CheckCircle,
        contentDescription = null,
        modifier = Modifier.size(48.dp),
        tint = MaterialTheme.colorScheme.primary
    )

    Text("密钥已生成 🎉", style = MaterialTheme.typography.headlineSmall)
    Text(
        "将下面的公钥配置到推送 SDK 中，用于注册此设备",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    // Public key display
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("你的公钥", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(4.dp))
            SelectionContainer {
                Text(
                    state.publicKey,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }

    // Copy button
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedButton(
            onClick = {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("public_key", state.publicKey))
                Toast.makeText(context, "已复制公钥", Toast.LENGTH_SHORT).show()
                viewModel.setCopied(true)
            },
            modifier = Modifier.weight(1f)
        ) {
            if (state.copied) {
                Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text("已复制")
            } else {
                Icon(Icons.Default.ContentCopy, null)
                Spacer(Modifier.width(8.dp))
                Text("复制公钥")
            }
        }
    }

    Spacer(Modifier.height(8.dp))

    // Instructions
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.3f)
        )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("📋 接下来的步骤", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                "1. 复制上面的公钥\n" +
                        "2. 使用管理 SDK 或 CLI 调用 POST /api/recipients 注册此设备\n" +
                        "3. 拿到返回的 Recipient Token（格式 rt_xxx）\n" +
                        "4. 进入 App 后，在 设置 页面填入 Token\n" +
                        "5. 即可开始接收加密消息",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    Spacer(Modifier.height(16.dp))

    Button(
        onClick = onSetupComplete,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("进入应用")
    }
}

@Composable
private fun SelectionContainer(content: @Composable () -> Unit) {
    // Simple wrapper — in a real app, use androidx.compose.foundation.text.selection.SelectionContainer
    content()
}

private fun getPasswordStrength(pwd: String): Int {
    var score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    if (pwd.any { it.isUpperCase() } && pwd.any { it.isLowerCase() }) score++
    if (pwd.any { it.isDigit() } && pwd.any { !it.isLetterOrDigit() }) score++
    return score
}
