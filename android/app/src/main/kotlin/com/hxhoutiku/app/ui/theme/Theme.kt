package com.hxhoutiku.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Brand colors
private val HxBlue = Color(0xFF1d9bf0)
private val HxDarkBg = Color(0xFF0f172a)
private val HxDarkSurface = Color(0xFF1e293b)

private val DarkColorScheme = darkColorScheme(
    primary = HxBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF003258),
    secondary = Color(0xFF64748b),
    background = HxDarkBg,
    surface = HxDarkSurface,
    surfaceVariant = Color(0xFF334155),
    onBackground = Color(0xFFf1f5f9),
    onSurface = Color(0xFFe2e8f0),
    error = Color(0xFFef4444),
    outline = Color(0xFF475569)
)

private val LightColorScheme = lightColorScheme(
    primary = HxBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFdbeafe),
    secondary = Color(0xFF64748b),
    background = Color(0xFFf8fafc),
    surface = Color.White,
    surfaceVariant = Color(0xFFf1f5f9),
    onBackground = Color(0xFF0f172a),
    onSurface = Color(0xFF1e293b),
    error = Color(0xFFdc2626),
    outline = Color(0xFFcbd5e1)
)

@Composable
fun HxTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}
