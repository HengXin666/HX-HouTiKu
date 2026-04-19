# Android 原生 App

> 本文档说明如何构建 Android APK、配置 Firebase 实现系统级推送通知。

---

## 目录

- [为什么需要原生 App](#为什么需要原生-app)
- [为什么需要 Firebase](#为什么需要-firebase)
- [配置流程总览](#配置流程总览)
- [第一步：创建 Firebase 项目](#第一步创建-firebase-项目)
- [第二步：下载 google-services.json](#第二步下载-google-servicesjson)
- [第三步：下载服务账号 JSON](#第三步下载服务账号-json)
- [第四步：配置 Worker Secret](#第四步配置-worker-secret)
- [第五步：配置 GitHub Secret](#第五步配置-github-secret)
- [第六步：构建 APK](#第六步构建-apk)
- [推送通知行为说明](#推送通知行为说明)
- [常见问题](#常见问题)

---

## 为什么需要原生 App

PWA（渐进式 Web 应用）虽然也能安装到手机桌面，但有几个硬限制：

| 能力 | PWA | 原生 App (Capacitor) |
|------|-----|---------------------|
| 后台推送通知 | ⚠️ 部分 Android 浏览器会杀后台 | ✅ FCM 系统级唤醒 |
| 状态栏通知 | ⚠️ 依赖浏览器进程存活 | ✅ 系统原生通知 |
| 锁屏显示 | ❌ 无法穿透锁屏 | ✅ 锁屏通知栏 |
| 震动控制 | ⚠️ 有限 | ✅ 完整系统 API |
| 通知渠道 | ❌ 不支持 | ✅ Android 8+ 分渠道管理 |

**结论**：如果你需要"消息到了就能看到，无论手机在干什么"，必须用原生 App。

---

## 为什么需要 Firebase

**这是 Android 系统的设计决定，不是我们选择的。**

在 Android 上，一个 App 想在后台接收实时推送，只有两条路：

1. **自己维持长连接**（WebSocket / 长轮询）— 极其耗电，系统会积极杀掉后台进程，几乎不可行。
2. **通过 Google 的 FCM（Firebase Cloud Messaging）通道** — 所有 App 共享 Google Play Services 维护的一条系统级连接，省电、可靠、锁屏也能收到。

```
                   你的 Worker 后端
                         │
                         │ HTTP POST (FCM API)
                         ▼
              ┌─── Google FCM 服务器 ───┐
              │  维护与所有 Android 设备  │
              │  的持久连接              │
              └──────────┬──────────────┘
                         │ 系统级推送
                         ▼
              ┌─── Android 设备 ────────┐
              │  Google Play Services    │
              │    → 唤醒你的 App        │
              │    → 系统通知栏显示      │
              └─────────────────────────┘
```

**Firebase 只是通道，不存储你的消息内容。** 我们的实现方式：

- 消息体依然是 ECIES 加密的，FCM 只传递一个"有新消息"的信号 + 加密后的 payload
- Firebase 看不到明文内容
- 你**不需要**使用 Firebase 的任何其他功能（数据库、分析等），只用 FCM 推送这一项

> 💡 如果你只使用 PWA（浏览器访问），完全不需要配置 Firebase。Firebase 只和 Android 原生 APK 有关。

---

## 配置流程总览

```
Firebase Console  ─→  google-services.json  ─→  APK 构建时注入（客户端身份）
                  ─→  服务账号 JSON          ─→  Worker Secret（服务端发送权限）
```

需要配置两个文件：

| 文件 | 用途 | 放在哪 |
|------|------|--------|
| `google-services.json` | 客户端配置 — 告诉 App "去哪个 Firebase 项目注册设备" | GitHub Secret → 构建时注入 APK |
| 服务账号 JSON | 服务端凭证 — 让 Worker 有权限调用 FCM API 发送推送 | Wrangler Secret `FCM_SERVICE_ACCOUNT` |

---

## 第一步：创建 Firebase 项目

1. 打开 [Firebase Console](https://console.firebase.google.com/)
2. 点击 **创建项目**（或 Add project）
3. 项目名随意填，比如 `hx-houtiku`
4. Google Analytics 可选（推送功能不需要），关掉也行
5. 点击 **创建项目**，等待完成

---

## 第二步：下载 google-services.json

1. 在 Firebase 项目首页，点击 **Android 图标**（添加应用）
2. **Android 包名**填写：`com.hxhoutiku.app`
   - 必须和 `frontend/capacitor.config.ts` 中的 `appId` 一致
3. 应用昵称随意填
4. SHA-1 证书指纹**可以跳过**（FCM 不需要）
5. 点击 **注册应用**
6. 下载 `google-services.json`

> ⚠️ **这个文件不要提交到 Git！** 它包含 Firebase 项目的 API Key。
> `.gitignore` 已经配置了忽略规则。

---

## 第三步：下载服务账号 JSON

这是让你的 Worker 后端有权限调用 FCM API 的凭证。

1. 在 Firebase Console 左侧菜单：**项目设置**（齿轮图标）
2. 切换到 **服务账号** 标签页
3. 确认选中 **Firebase Admin SDK**
4. 点击 **生成新的私钥**
5. 确认后会下载一个 JSON 文件（类似 `hx-houtiku-firebase-adminsdk-xxxxx.json`）

> ⚠️ **这个文件是最高敏感级别！** 拥有它等于拥有你 Firebase 项目的管理员权限。
> 绝对不要提交到 Git、不要发给别人、不要放在公开可访问的位置。

---

## 第四步：配置 Worker Secret

Worker 需要这个服务账号来调用 FCM API。我们把 JSON 文件 Base64 编码后存入 Wrangler Secret：

```bash
# Linux / macOS
base64 -w0 < hx-houtiku-firebase-adminsdk-xxxxx.json | npx wrangler secret put FCM_SERVICE_ACCOUNT

# Windows PowerShell
$bytes = [IO.File]::ReadAllBytes("hx-houtiku-firebase-adminsdk-xxxxx.json")
$b64 = [Convert]::ToBase64String($bytes)
$b64 | npx wrangler secret put FCM_SERVICE_ACCOUNT
```

验证：

```bash
npx wrangler secret list
# 应该能看到 FCM_SERVICE_ACCOUNT
```

> 💡 如果你不配置这个 Secret，Worker 仍然正常运行 —— 只是 Android 原生推送不会发出，Web Push 不受影响。

---

## 第五步：配置 GitHub Secret

CI 构建 APK 时需要把 `google-services.json` 注入到 Android 项目中：

```bash
# Linux / macOS
base64 -w0 < google-services.json | gh secret set GOOGLE_SERVICES_JSON

# Windows PowerShell
$bytes = [IO.File]::ReadAllBytes("google-services.json")
[Convert]::ToBase64String($bytes) | gh secret set GOOGLE_SERVICES_JSON

# 或者手动：复制 Base64 内容 → GitHub 仓库 Settings → Secrets → 新建 GOOGLE_SERVICES_JSON
```

---

## 第六步：构建 APK

### 方式一：GitHub Actions 自动构建（推荐）

```bash
# 打 tag 触发构建
git tag v1.0.0
git push origin v1.0.0
```

或者在 GitHub → Actions → `📱 构建 Android APK` → Run workflow 手动触发。

构建完成后，APK 会出现在 [Releases](../../releases) 页面。

### 方式二：本地构建

```bash
cd frontend
pnpm install && pnpm build
npx cap add android
npx cap sync android

# 把 google-services.json 复制到 android/app/
cp /path/to/google-services.json android/app/

# 用 Android Studio 打开 android/ 目录构建
# 或者命令行：
cd android && ./gradlew assembleRelease
```

---

## 推送通知行为说明

配置完成后，推送通知的行为如下：

### App 在后台 / 锁屏时

FCM 的 `notification` payload **由 Android 系统直接处理**，不需要 App 代码参与：

- ✅ 状态栏出现通知图标
- ✅ 锁屏时在通知栏显示
- ✅ 按优先级震动（urgent 持续震动、high 短震动、default 静默）
- ✅ 点击通知打开 App 并跳转到对应消息

### App 在前台时

FCM 在前台**不会**自动显示系统通知（这是 Android 的设计），我们通过 `@capacitor/local-notifications` 手动创建：

- ✅ 状态栏仍然会出现通知
- ✅ 同时在 App 内实时刷新消息列表
- ✅ 震动反馈

### 通知渠道（Android 8+）

我们创建了 3 个通知渠道，用户可以在系统设置中分别控制：

| 渠道 | 对应优先级 | 重要性 | 行为 |
|------|-----------|--------|------|
| 紧急消息 | urgent | MAX | 弹窗、持续震动、亮屏 |
| 重要消息 | high | HIGH | 弹窗、震动 |
| 普通消息 | default | DEFAULT | 静默通知 |

用户可以在 **系统设置 → 应用 → HX-HouTiKu → 通知** 中单独开关每个渠道。

---

## 常见问题

### Q: 不配置 Firebase 会怎样？

Worker 正常运行，Web Push（浏览器通知）正常工作。只是 Android 原生 App 收不到后台推送——消息仍然在，只是需要打开 App 才能看到。

### Q: Firebase 是免费的吗？

是的。FCM（Cloud Messaging）完全免费，没有消息量限制。你不需要付费套餐。

### Q: Firebase 能看到我的消息内容吗？

看不到。我们发送的是 ECIES 加密后的密文。FCM 只是一个传输通道，它传递的是不可读的加密数据。

### Q: 没有 Google Play Services 的手机（如华为）怎么办？

目前不支持。没有 GMS 的设备无法使用 FCM。未来可能考虑接入 HMS Push（华为推送），但目前没有计划。

作为替代，可以使用 PWA 模式——在浏览器中打开并添加到桌面。

### Q: google-services.json 泄露了怎么办？

风险有限。它只包含 Firebase 项目的客户端配置（API Key、项目 ID 等），攻击者可以用它注册设备到你的 FCM 项目，但**无法发送推送**（发送需要服务账号）。

如果担心，可以在 Firebase Console → 项目设置 → API 密钥 中限制 API Key 的使用范围。

### Q: 服务账号 JSON 泄露了怎么办？

**严重！** 立即：
1. Firebase Console → 项目设置 → 服务账号 → 删除泄露的密钥
2. 重新生成新密钥
3. 更新 Wrangler Secret：`npx wrangler secret put FCM_SERVICE_ACCOUNT`

### Q: 构建 APK 时提示 "google-services.json not found"

确认：
1. GitHub Secret `GOOGLE_SERVICES_JSON` 已设置
2. 内容是 Base64 编码的（不是原始 JSON）
3. 构建日志中能看到 "✅ google-services.json 已写入"

如果本地构建，确认文件在 `frontend/android/app/google-services.json`。
