import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hxhoutiku.app",
  appName: "HX-HouTiKu",
  webDir: "dist",

  // ── 服务端 URL（可选，不设则打包离线 Web 资产）──
  // 开发时可取消注释，直接连接 dev server
  // server: {
  //   url: "http://192.168.1.x:5173",
  //   cleartext: true,
  // },

  android: {
    // 允许混合内容（开发调试用，生产构建会走 HTTPS）
    allowMixedContent: false,
    // WebView 背景色，与 PWA theme_color 保持一致
    backgroundColor: "#0f172a",
  },

  plugins: {
    // 状态栏样式
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f172a",
    },
    // 启动画面
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    // 推送通知 (FCM) — 后台/锁屏通知由 FCM notification payload 自动处理
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // 本地通知 — 用于前台时在状态栏显示推送通知
    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#1d9bf0",
    },
    // 键盘行为 — 用 "none" 避免系统自动 resize body 导致布局错乱，
    // 改用 visualViewport API 在 JS 层处理。
    Keyboard: {
      resize: "none",
      resizeOnFullScreen: false,
      style: "DARK",
    },
  },
};

export default config;
