package com.hxhoutiku.app.ui.screen.setup

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

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
            // Step indicator
            LinearProgressIndicator(
                progress = { uiState.step / 3f },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))

            when (uiState.step) {
                1 -> StepApiConfig(viewModel, uiState)
                2 -> StepPassword(viewModel, uiState)
                3 -> StepRegister(viewModel, uiState, onSetupComplete)
            }
        }
    }
}

@Composable
private fun StepApiConfig(viewModel: SetupViewModel, state: SetupUiState) {
    Text("第 1 步：配置服务器", style = MaterialTheme.typography.headlineSmall)
    Text(
        "输入你的 Worker API 地址",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    OutlinedTextField(
        value = state.apiBase,
        onValueChange = viewModel::setApiBase,
        label = { Text("API 地址") },
        placeholder = { Text("https://hx-houtiku-api.xxx.workers.dev") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
    )

    OutlinedTextField(
        value = state.adminToken,
        onValueChange = viewModel::setAdminToken,
        label = { Text("管理员令牌") },
        placeholder = { Text("sk-hx-houtiku-...") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
    )

    Button(
        onClick = viewModel::nextStep,
        modifier = Modifier.fillMaxWidth(),
        enabled = state.apiBase.isNotBlank() && state.adminToken.isNotBlank()
    ) {
        Text("下一步")
    }
}

@Composable
private fun StepPassword(viewModel: SetupViewModel, state: SetupUiState) {
    var showPassword by remember { mutableStateOf(false) }

    Text("第 2 步：设置主密码", style = MaterialTheme.typography.headlineSmall)
    Text(
        "主密码用于加密保护你的私钥。忘记密码将无法解密消息！",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    OutlinedTextField(
        value = state.password,
        onValueChange = viewModel::setPassword,
        label = { Text("主密码") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
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

    OutlinedTextField(
        value = state.passwordConfirm,
        onValueChange = viewModel::setPasswordConfirm,
        label = { Text("确认密码") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        isError = state.passwordConfirm.isNotEmpty() && state.password != state.passwordConfirm
    )

    if (state.password.length in 1..11) {
        Text(
            "密码至少需要 12 个字符",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }

    Button(
        onClick = viewModel::generateKeys,
        modifier = Modifier.fillMaxWidth(),
        enabled = state.password.length >= 12 && state.password == state.passwordConfirm
    ) {
        Icon(Icons.Default.Key, contentDescription = null)
        Spacer(Modifier.width(8.dp))
        Text("生成密钥对")
    }
}

@Composable
private fun StepRegister(
    viewModel: SetupViewModel,
    state: SetupUiState,
    onSetupComplete: () -> Unit
) {
    Text("第 3 步：注册设备", style = MaterialTheme.typography.headlineSmall)
    Text(
        "密钥已生成！为这台设备取一个名称来注册。",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    if (state.publicKey.isNotEmpty()) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("公钥", style = MaterialTheme.typography.labelSmall)
                Text(
                    state.publicKey.take(32) + "...",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
            }
        }
    }

    OutlinedTextField(
        value = state.recipientName,
        onValueChange = viewModel::setRecipientName,
        label = { Text("设备名称") },
        placeholder = { Text("my-android") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )

    if (state.error != null) {
        Text(
            state.error,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }

    Button(
        onClick = { viewModel.register(onSetupComplete) },
        modifier = Modifier.fillMaxWidth(),
        enabled = state.recipientName.isNotBlank() && !state.isLoading
    ) {
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp
            )
            Spacer(Modifier.width(8.dp))
        }
        Text("注册并完成")
    }
}
