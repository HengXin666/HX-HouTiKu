/**
 * Lightweight toast notification — replaces antd-mobile Toast.
 * Uses a simple DOM-based approach.
 */

let activeToast: HTMLElement | null = null;

interface ToastOptions {
  content: string;
  position?: "top" | "bottom" | "center";
  duration?: number;
}

export const Toast = {
  show(options: ToastOptions) {
    const { content, position = "bottom", duration = 2000 } = options;

    // Remove existing toast
    if (activeToast) {
      activeToast.remove();
      activeToast = null;
    }

    const el = document.createElement("div");
    el.className = `ui-toast ui-toast--${position}`;
    el.textContent = content;
    document.body.appendChild(el);
    activeToast = el;

    // Trigger animation
    requestAnimationFrame(() => {
      el.classList.add("ui-toast--visible");
    });

    setTimeout(() => {
      el.classList.remove("ui-toast--visible");
      setTimeout(() => {
        el.remove();
        if (activeToast === el) activeToast = null;
      }, 200);
    }, duration);
  },
};
