# HX-HouTiKu — Android 原生客户端

纯 Kotlin + Jetpack Compose 实现的 Android 原生客户端，完全摆脱 WebView/Capacitor。

## 技术栈

| 层 | 技术 |
|----|------|
| UI | **Jetpack Compose** + **Material 3** (Dynamic Color) |
| 架构 | **MVVM** + **Hilt** 依赖注入 |
| 网络 | **Retrofit 2** + **OkHttp** + **Moshi** |
| 数据库 | **Room** (SQLite) |
| 密钥存储 | **EncryptedSharedPreferences** (Android Keystore) |
| 加密 | **Bouncy Castle** (ECIES secp256k1 + PBKDF2 + AES-256-GCM) |
| 推送 | **Firebase Cloud Messaging** (FCM) |
| 导航 | **Navigation Compose** |
| 图片 | **Coil** |
| Markdown | **Markwon** |

## 对比旧方案 (Capacitor WebView)

| 对比项 | WebView (旧) | 原生 (新) |
|--------|-------------|-----------|
| 启动速度 | ~2-3s (加载 Web 资源) | ~200ms (原生 Activity) |
| 内存占用 | ~150MB+ (Chromium) | ~40-60MB |
| 推送可靠性 | 依赖 WebView 进程存活 | 系统级 FCM，独立于 App 进程 |
| 动画流畅度 | 60fps 但偶有卡顿 | 原生 Compose 动画，始终流畅 |
| 包大小 | ~15MB (含 Web 资源) | ~8MB (AOT 编译) |
| 安全性 | JS 内存中私钥易被 dump | Keystore 硬件级保护 |
| 通知体验 | 简陋，无法显示解密内容 | 原生通知，解密后直接显示标题 |

## 项目结构

```
android/
├── app/
│   ├── src/main/
│   │   ├── kotlin/com/hxhoutiku/app/
│   │   │   ├── HxApp.kt                      # Application (通知渠道)
│   │   │   ├── MainActivity.kt               # 入口 Activity
│   │   │   ├── crypto/
│   │   │   │   ├── EciesManager.kt           # ECIES 加解密 (兼容 eciesjs)
│   │   │   │   └── KeyManager.kt             # 私钥管理 (PBKDF2+AES)
│   │   │   ├── data/
│   │   │   │   ├── local/
│   │   │   │   │   ├── HxDatabase.kt         # Room 数据库
│   │   │   │   │   ├── dao/MessageDao.kt     # 消息 DAO
│   │   │   │   │   └── entity/MessageEntity.kt
│   │   │   │   ├── remote/
│   │   │   │   │   ├── HxApi.kt              # Retrofit API
│   │   │   │   │   └── dto/ApiModels.kt      # 请求/响应模型
│   │   │   │   └── repository/
│   │   │   │       └── MessageRepository.kt  # 数据仓库
│   │   │   ├── di/
│   │   │   │   ├── NetworkModule.kt          # Hilt 网络注入
│   │   │   │   └── DatabaseModule.kt         # Hilt 数据库注入
│   │   │   ├── service/
│   │   │   │   └── HxFirebaseMessagingService.kt  # FCM 服务
│   │   │   └── ui/
│   │   │       ├── Navigation.kt             # 导航图
│   │   │       ├── theme/Theme.kt            # Material3 主题
│   │   │       ├── viewmodel/AuthViewModel.kt
│   │   │       └── screen/
│   │   │           ├── setup/                # 设置向导
│   │   │           ├── lock/                 # 锁屏
│   │   │           ├── feed/                 # 消息流
│   │   │           ├── detail/               # 消息详情
│   │   │           ├── groups/               # 分组
│   │   │           └── settings/             # 设置
│   │   └── res/                              # Android 资源
│   └── build.gradle.kts
├── gradle/libs.versions.toml                 # 版本目录
├── build.gradle.kts                          # 项目级构建
└── settings.gradle.kts
```

## 开发指南

### 前置要求

- Android Studio Ladybug+ (2024.2+)
- JDK 17
- Android SDK 35

### 本地开发

```bash
cd android

# google-services.json 从 GitHub Secrets 自动注入 (CI)
# 本地开发时从 GitHub Secret 解码，或从 Firebase Console 下载：
echo "$GOOGLE_SERVICES_JSON_BASE64" | base64 -d > app/google-services.json
# ⚠️ 该文件已在 .gitignore 中，绝对不要提交到仓库！

# 配置前端地址 (gradle.properties 也已 gitignore)
# ⚠️ 这是 WebView 加载的前端地址，不是 Worker API 地址！
# 本地开发时指向 Vite dev server（10.0.2.2 是模拟器访问主机的 IP）
echo 'API_BASE=http://10.0.2.2:5173' >> gradle.properties

# 用 Android Studio 打开，或命令行构建
./gradlew assembleDebug
```

> **安全提醒**：`google-services.json` 和 `gradle.properties`（含 API 地址）均已在 `.gitignore` 中，
> 不会被提交。CI 构建时由 GitHub Secrets 自动注入，开发者无需手动管理。

### 构建 Release APK

```bash
# 确保已配置签名密钥
./gradlew assembleRelease
```

### Firebase 配置

1. 在 [Firebase Console](https://console.firebase.google.com/) 创建项目
2. 添加 Android 应用，包名为 `com.hxhoutiku.app`
3. 下载 `google-services.json`，**Base64 编码后存入 GitHub Secret**：
   ```bash
   base64 -w 0 google-services.json | gh secret set GOOGLE_SERVICES_JSON
   ```
4. 生成服务账号 JSON，Base64 后配置到 Worker 的 `FCM_SERVICE_ACCOUNT` secret

> 🔒 `google-services.json` 已在 `.gitignore` 中，绝不会被提交。
> CI 构建时自动从 `GOOGLE_SERVICES_JSON` secret 解码注入。
> 本地开发可一次性从 Firebase Console 下载放入 `app/` 目录。

## 加密兼容性

本客户端的 ECIES 实现与以下库完全兼容：

- **eciesjs** (npm) — PWA 前端使用
- **eciespy** (Python) — SDK 使用

加密格式：`ephemeral_pubkey (65B) || iv (16B) || tag (16B) || ciphertext`

私钥保护格式与 PWA 一致：`PBKDF2(password, salt, 600000) → AES-256-GCM`
