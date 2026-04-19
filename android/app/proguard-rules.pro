# ============================================================
#  HX-HouTiKu  —  ProGuard / R8 rules
# ============================================================

# ── App data classes (JSON serialization) ────────────────────
-keep class com.hxhoutiku.app.data.remote.dto.** { *; }
-keep class com.hxhoutiku.app.data.local.entity.** { *; }
-keep class com.hxhoutiku.app.updater.GitHubRelease { *; }
-keep class com.hxhoutiku.app.updater.GitHubAsset { *; }

# ── Bouncy Castle ────────────────────────────────────────────
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# ── Moshi ────────────────────────────────────────────────────
-keep class com.squareup.moshi.** { *; }
-keep @com.squareup.moshi.JsonQualifier interface *
-keepclassmembers @com.squareup.moshi.JsonClass class * {
    <init>(...);
    <fields>;
}
-keepnames @com.squareup.moshi.JsonClass class *

# ── Retrofit ─────────────────────────────────────────────────
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**

# ── OkHttp ───────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ── Room ─────────────────────────────────────────────────────
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# ── Markwon & commonmark ─────────────────────────────────────
-keep class io.noties.markwon.** { *; }
-dontwarn io.noties.markwon.**
-keep class org.commonmark.** { *; }
-dontwarn org.commonmark.**

# ── Hilt / Dagger ────────────────────────────────────────────
-dontwarn dagger.**
-keep class dagger.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# ── Firebase ─────────────────────────────────────────────────
-dontwarn com.google.firebase.**

# ── Coroutines ───────────────────────────────────────────────
-dontwarn kotlinx.coroutines.**

# ── Coil ─────────────────────────────────────────────────────
-dontwarn coil.**

# ── General: suppress warnings for optional / compile-only deps ──
-dontwarn javax.annotation.**
-dontwarn kotlin.reflect.jvm.internal.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn java.lang.invoke.StringConcatFactory
