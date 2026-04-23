# ============================================================
#  HX-HouTiKu  —  ProGuard / R8 rules (WebView hybrid)
# ============================================================

# ── Coroutines ───────────────────────────────────────────────
-dontwarn kotlinx.coroutines.**

# ── WebView JS Bridge — keep all @JavascriptInterface methods ──
-keepclassmembers class com.hxhoutiku.app.MainActivity$HxNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# ── General ──────────────────────────────────────────────────
-dontwarn javax.annotation.**
-dontwarn kotlin.reflect.jvm.internal.**
-dontwarn java.lang.invoke.StringConcatFactory
