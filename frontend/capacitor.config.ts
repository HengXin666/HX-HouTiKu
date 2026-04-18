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
    // 推送通知（复用 Web Push 逻辑，原生层仅做权限桥接）
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // 键盘行为
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
