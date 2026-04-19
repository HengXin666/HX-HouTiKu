# Bouncy Castle — keep all crypto providers
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Moshi
-keep class com.squareup.moshi.** { *; }
-keep @com.squareup.moshi.JsonQualifier interface *
-keepclassmembers @com.squareup.moshi.JsonClass class * {
    <init>(...);
    <fields>;
}

# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Room
-keep class * extends androidx.room.RoomDatabase { *; }

# Keep data classes used in JSON
-keep class com.hxhoutiku.app.data.remote.dto.** { *; }
-keep class com.hxhoutiku.app.data.local.entity.** { *; }
-keep class com.hxhoutiku.app.updater.GitHubRelease { *; }
-keep class com.hxhoutiku.app.updater.GitHubAsset { *; }
