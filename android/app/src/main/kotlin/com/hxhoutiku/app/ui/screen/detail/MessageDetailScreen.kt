package com.hxhoutiku.app.ui.screen.detail

import android.widget.TextView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import io.noties.markwon.Markwon
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.html.HtmlPlugin
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageDetailScreen(
    messageId: String,
    onBack: () -> Unit,
    viewModel: MessageDetailViewModel = hiltViewModel()
) {
    val message by viewModel.message.collectAsState()

    LaunchedEffect(messageId) {
        viewModel.loadMessage(messageId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("消息详情") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回")
                    }
                }
            )
        }
    ) { padding ->
        val msg = message
        if (msg == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = androidx.compose.ui.Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Title
                Text(
                    msg.title,
                    style = MaterialTheme.typography.headlineSmall
                )

                // Metadata
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SuggestionChip(
                        onClick = {},
                        label = { Text(msg.priority) }
                    )
                    SuggestionChip(
                        onClick = {},
                        label = { Text(msg.group) }
                    )
                }

                Text(
                    formatFullTimestamp(msg.timestamp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                HorizontalDivider()

                // Body (Markdown rendered)
                MarkdownContent(msg.body)
            }
        }
    }
}

@Composable
private fun MarkdownContent(markdown: String) {
    val context = LocalContext.current
    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(TablePlugin.create(context))
            .usePlugin(HtmlPlugin.create())
            .build()
    }

    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(ctx.getColor(android.R.color.white))
                textSize = 15f
                setPadding(0, 0, 0, 0)
            }
        },
        update = { textView ->
            markwon.setMarkdown(textView, markdown)
        },
        modifier = Modifier.fillMaxWidth()
    )
}

private fun formatFullTimestamp(ts: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    return sdf.format(Date(ts))
}
