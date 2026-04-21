/**
 * React hook for WebSocket status — thin wrapper around ws-manager.
 *
 * This hook does NOT manage the WebSocket connection. It only subscribes
 * to status snapshots from the global ws-manager singleton using
 * useSyncExternalStore (zero re-render overhead, tear-safe).
 */

import { useSyncExternalStore } from "react";
import {
  wsOnStatus,
  wsGetStatus,
  wsGetDeviceCount,
  type WsStatus,
} from "@/lib/ws-manager";

interface WsSnapshot {
  status: WsStatus;
  deviceCount: number;
}

/** Snapshot reference — replaced on every status change. */
let snapshot: WsSnapshot = {
  status: wsGetStatus(),
  deviceCount: wsGetDeviceCount(),
};

/** Subscribe to ws-manager status changes. */
function subscribe(onStoreChange: () => void): () => void {
  return wsOnStatus((status, deviceCount) => {
    snapshot = { status, deviceCount };
    onStoreChange();
  });
}

function getSnapshot(): WsSnapshot {
  return snapshot;
}

function getServerSnapshot(): WsSnapshot {
  return { status: "idle", deviceCount: 0 };
}

export function useWebSocket(): WsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
