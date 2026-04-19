/**
 * Lightweight Dialog component — replaces antd-mobile Dialog.
 * Declarative API compatible with existing usage.
 */

import { useEffect, useRef } from "react";

interface DialogAction {
  key: string;
  text: string;
  bold?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

interface DialogProps {
  visible: boolean;
  content: React.ReactNode;
  closeOnAction?: boolean;
  onClose?: () => void;
  actions?: DialogAction[][];
}

export function Dialog({ visible, content, onClose, actions }: DialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="ui-dialog-backdrop"
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose?.();
      }}
    >
      <div className="ui-dialog">
        <div className="ui-dialog-content">
          {typeof content === "string"
            ? content.split("\n").map((line, i) => (
                <p key={i} style={{ margin: "0.25rem 0" }}>
                  {line}
                </p>
              ))
            : content}
        </div>
        {actions && (
          <div className="ui-dialog-actions">
            {actions.flat().map((action) => (
              <button
                key={action.key}
                onClick={action.onClick}
                className={[
                  "ui-dialog-btn",
                  action.bold && "ui-dialog-btn--bold",
                  action.danger && "ui-dialog-btn--danger",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {action.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
