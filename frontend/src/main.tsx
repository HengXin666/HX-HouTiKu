import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

// Force Service Worker to update immediately (avoid stale PWA cache)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  });
  // When a new SW activates, reload to get the latest version
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
