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
  | { type: "pong" }
  | { type: "connected"; device_count: number }
  | { type: "error"; message: string };

export class MessageRelay implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

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
    const sockets = this.state.getWebSockets();
    const countMsg = JSON.stringify({
      type: "connected",
      device_count: sockets.length,
    } satisfies ServerMessage);
    for (const s of sockets) {
      try { s.send(countMsg); } catch { /* dead socket */ }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Internal endpoint: Worker calls this after storing a message in D1.
   * Broadcasts the encrypted payload to all connected WebSocket clients.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    const payload = await request.json<ServerMessage>();
    const sockets = this.state.getWebSockets();

    let sent = 0;
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify(payload));
        sent++;
      } catch {
        // Socket is dead — close it so Hibernation API cleans up
        try { ws.close(1011, "Send failed"); } catch { /* ignore */ }
      }
    }

    return Response.json({ sent, total: sockets.length });
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
    // Broadcast updated device count to remaining sockets
    const sockets = this.state.getWebSockets();
    if (sockets.length > 0) {
      const countMsg = JSON.stringify({
        type: "connected",
        device_count: sockets.length,
      } satisfies ServerMessage);
      for (const s of sockets) {
        try { s.send(countMsg); } catch { /* dead socket */ }
      }
    }
  }

  /**
   * Called when a WebSocket encounters an error.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    try { ws.close(1011, "Internal error"); } catch { /* ignore */ }
  }

}
