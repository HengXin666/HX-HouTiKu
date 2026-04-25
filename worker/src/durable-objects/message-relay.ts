/**
 * MessageRelay — Durable Object for real-time WebSocket message delivery.
 *
 * Architecture:
 *   - One DO instance per recipient (keyed by recipient_id)
 *   - Uses WebSocket Hibernation API for cost efficiency (idle sockets don't consume CPU)
 *   - Supports multiple concurrent connections per recipient (e.g. phone + desktop)
 *   - Heartbeat via ping/pong to detect stale connections
 *
 * Message flow:
 *   1. SDK pushes encrypted message → Worker stores in D1 → calls DO.broadcast()
 *   2. DO wakes from hibernation → broadcasts to all connected WebSocket clients
 *   3. Client receives encrypted payload → decrypts locally with private key
 */

import type { Env } from "../types";

interface WebSocketMeta {
  recipientId: string;
  connectedAt: number;
  /** Optional device identifier for multi-device tracking */
  deviceId?: string;
}

/** Outbound message types sent to clients */
type ServerMessage =
  | {
      type: "new_message";
      message: {
        id: string;
        encrypted_data: string;
        priority: string;
        content_type: string;
        group: string;
        timestamp: number;
        is_read: false;
        channel_id?: string;
        group_key?: string;
      };
    }
  | { type: "message_deleted"; message_ids: string[] }
  | { type: "pong" }
  | { type: "connected"; device_count: number }
  | { type: "error"; message: string };

export class MessageRelay implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  /** 清理间隔：每 180 秒唤醒一次检测死连接（降低 DO Request 消耗） */
  private static readonly CLEANUP_INTERVAL_MS = 180_000;
  /** 如果一个 socket 超过此时间没有收到 ping，视为死连接（客户端 ping 间隔 25s） */
  private static readonly STALE_THRESHOLD_MS = 180_000;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Auto-respond to client pings without waking the DO.
    // Client sends: {"type":"ping"}  →  CF auto-replies: {"type":"pong"}
    // This avoids 20:1 inbound-message billing for heartbeats.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "pong" }),
      ),
    );
  }

  /**
   * HTTP handler — only accepts WebSocket upgrade requests.
   * Called by the Worker's /api/ws route after auth validation.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request, url);
    }

    // Internal broadcast call from push route
    if (url.pathname === "/broadcast" && request.method === "POST") {
      return this.handleBroadcast(request);
    }

    return new Response("Expected WebSocket or /broadcast", { status: 400 });
  }

  // ── WebSocket Lifecycle ─────────────────────────────────────

  private handleWebSocketUpgrade(request: Request, url: URL): Response {
    const recipientId = url.searchParams.get("recipient_id");
    if (!recipientId) {
      return new Response("Missing recipient_id", { status: 400 });
    }

    const deviceId = url.searchParams.get("device_id") ?? undefined;

    // Create a WebSocket pair (client ↔ server)
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Attach metadata for Hibernation API
    const meta: WebSocketMeta = {
      recipientId,
      connectedAt: Date.now(),
      deviceId,
    };

    // Accept with Hibernation API — the DO can hibernate while sockets stay open
    this.state.acceptWebSocket(server, [recipientId]);

    // Store metadata in websocket's attachment
    (server as any).serializeAttachment(meta);

    // Send connection confirmation to ALL connected sockets (including the new one)
    this.broadcastDeviceCount();

    // 有连接时启动定期清理 alarm
    this.ensureAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Internal endpoint: Worker calls this after storing a message in D1.
   * Broadcasts the encrypted payload to all connected WebSocket clients.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    const payload = await request.json<ServerMessage>();
    const sockets = this.state.getWebSockets();
    const totalBefore = sockets.length;

    let sent = 0;
    let dead = 0;
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify(payload));
        sent++;
      } catch {
        dead++;
        try { ws.close(1011, "Send failed"); } catch { /* ignore */ }
      }
    }

    // 如果有死连接被清理，广播更新后的设备数给存活的客户端
    if (dead > 0) {
      this.broadcastDeviceCount();
    }

    return Response.json({ sent, total: totalBefore });
  }

  // ── Hibernation API Callbacks ───────────────────────────────

  /**
   * Called when a hibernated DO wakes up due to an incoming WebSocket message.
   * Note: ping messages are handled by setWebSocketAutoResponse and never reach here.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // All client messages are currently handled by auto-response (ping → pong).
    // This callback is kept for future extensibility.
  }

  /**
   * Called when a WebSocket is closed (by client or network).
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.broadcastDeviceCount();
    this.ensureAlarm();
  }

  /**
   * Called when a WebSocket encounters an error.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    try { ws.close(1011, "Internal error"); } catch { /* ignore */ }
    this.broadcastDeviceCount();
  }

  /**
   * Durable Object alarm — 定期唤醒检测并清理死连接。
   * 当客户端进程被杀死时，TCP FIN 可能无法到达 Cloudflare，
   * 导致 getWebSockets() 仍返回已死的 socket。
   * 通过检查 getWebSocketAutoResponseTimestamp 判断 socket 是否仍活跃。
   */
  async alarm(): Promise<void> {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return;

    const now = Date.now();
    let cleaned = 0;

    for (const ws of sockets) {
      try {
        // getWebSocketAutoResponseTimestamp 返回最后一次自动回复 ping 的时间
        // 如果客户端已死，它不会再发 ping，时间戳会过期
        const lastPing = ws.deserializeAttachment() as WebSocketMeta | null;
        const lastAutoResponse = (ws as any).getWebSocketAutoResponseTimestamp?.();

        if (lastAutoResponse) {
          const lastTime = lastAutoResponse.getTime();
          if (now - lastTime > MessageRelay.STALE_THRESHOLD_MS) {
            console.log(`Closing stale socket (last ping: ${now - lastTime}ms ago)`);
            try { ws.close(1011, "Stale connection"); } catch { /* ignore */ }
            cleaned++;
          }
        }
      } catch {
        // 无法读取状态的 socket 也视为死连接
        try { ws.close(1011, "Unreadable socket"); } catch { /* ignore */ }
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.broadcastDeviceCount();
    }

    // 如果还有活跃连接，继续调度下一次清理
    const remaining = this.state.getWebSockets();
    if (remaining.length > 0) {
      this.state.storage.setAlarm(Date.now() + MessageRelay.CLEANUP_INTERVAL_MS);
    }
  }

  /** 向所有存活的 socket 广播当前设备数 */
  private broadcastDeviceCount(): void {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return;
    const countMsg = JSON.stringify({
      type: "connected",
      device_count: sockets.length,
    } satisfies ServerMessage);
    for (const s of sockets) {
      try { s.send(countMsg); } catch { /* dead socket */ }
    }
  }

  /** 确保 alarm 已调度（有连接时才需要） */
  private ensureAlarm(): void {
    const sockets = this.state.getWebSockets();
    if (sockets.length > 0) {
      this.state.storage.setAlarm(Date.now() + MessageRelay.CLEANUP_INTERVAL_MS);
    }
  }
}
