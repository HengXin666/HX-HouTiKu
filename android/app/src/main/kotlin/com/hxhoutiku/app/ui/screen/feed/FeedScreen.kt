package com.hxhoutiku.app.ui.screen.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.hxhoutiku.app.data.local.entity.MessageEntity
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    groupFilter: String? = null,
    onMessageClick: (String) -> Unit,
    onNavigateToGroups: () -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: FeedViewModel = hiltViewModel()
) {
    val messages by viewModel.messages.collectAsState(initial = emptyList())
    val unreadCount by viewModel.unreadCount.collectAsState(initial = 0)
    val isRefreshing by viewModel.isRefreshing.collectAsState()

    LaunchedEffect(groupFilter) {
        viewModel.setGroupFilter(groupFilter)
        viewModel.refresh()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(groupFilter ?: "消息")
                        if (unreadCount > 0) {
                            Text(
                                "$unreadCount 条未读",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToGroups) {
                        Icon(Icons.Default.FolderOpen, "分组")
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, "设置")
                    }
                }
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (messages.isEmpty() && !isRefreshing) {
                EmptyState()
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    items(messages, key = { it.id }) { message ->
                        MessageCard(
                            message = message,
                            onClick = { onMessageClick(message.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageCard(message: MessageEntity, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (message.isRead)
                MaterialTheme.colorScheme.surface
            else
                MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Priority indicator
            PriorityDot(message.priority)
            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        message.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (!message.isRead) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        formatTimestamp(message.timestamp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(Modifier.height(4.dp))

                Text(
                    message.body.take(100).replace('\n', ' '),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(Modifier.height(4.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    SuggestionChip(
                        onClick = {},
                        label = { Text(message.group, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.height(24.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun PriorityDot(priority: String) {
    val color = when (priority) {
        "urgent" -> Color(0xFFef4444)
        "high" -> Color(0xFFf59e0b)
        "default" -> Color(0xFF3b82f6)
        "low" -> Color(0xFF6b7280)
        "debug" -> Color(0xFF9ca3af)
        else -> Color(0xFF6b7280)
    }
    Surface(
        modifier = Modifier.size(10.dp),
        shape = MaterialTheme.shapes.small,
        color = color
    ) {}
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.Inbox,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "暂无消息",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "下拉刷新或等待推送",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
        }
    }
}

private fun formatTimestamp(ts: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - ts

    return when {
        diff < 60_000 -> "刚刚"
        diff < 3_600_000 -> "${diff / 60_000} 分钟前"
        diff < 86_400_000 -> "${diff / 3_600_000} 小时前"
        diff < 604_800_000 -> "${diff / 86_400_000} 天前"
        else -> SimpleDateFormat("MM/dd", Locale.getDefault()).format(Date(ts))
    }
}
