/**
 * Lightweight Switch component — replaces antd-mobile Switch.
 */

import type { CSSProperties } from "react";

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Switch({ checked, onChange, loading, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || loading}
      className={[
        "ui-switch",
        checked && "ui-switch--checked",
        loading && "ui-switch--loading",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onChange?.(!checked)}
    >
      <span className="ui-switch-handle">
        {loading && <span className="ui-switch-spinner" />}
      </span>
    </button>
  );
}
