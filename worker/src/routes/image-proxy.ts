/**
 * Image proxy route — bypasses Referer-based hotlink protection.
 *
 * GET /api/image-proxy?url=https://...
 *
 * The worker fetches the image without a Referer header, then
 * streams it back to the client with proper cache headers.
 * This allows rendering images from sites like Bilibili (hdslb.com)
 * that block requests with foreign Referer headers.
 */

import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

/** Allowed image MIME types — reject non-image responses for safety. */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/** Domains that are known to require Referer removal. */
const HOTLINK_DOMAINS = [
  "hdslb.com",       // Bilibili CDN
  "i0.hdslb.com",
  "i1.hdslb.com",
  "i2.hdslb.com",
  "bilivideo.com",
  "biliimg.com",
  "sinaimg.cn",      // Weibo
  "wx1.sinaimg.cn",
  "wx2.sinaimg.cn",
  "wx3.sinaimg.cn",
  "wx4.sinaimg.cn",
  "mmbiz.qpic.cn",   // WeChat
  "pic1.zhimg.com",   // Zhihu
  "pic2.zhimg.com",
  "pic3.zhimg.com",
  "pic4.zhimg.com",
];

app.get("/", async (c) => {
  const targetUrl = c.req.query("url");

  if (!targetUrl) {
    return c.json({ error: "url parameter is required" }, 400);
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  // Only allow https
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return c.json({ error: "Only http/https URLs are supported" }, 400);
  }

  // Force HTTPS
  parsed.protocol = "https:";

  try {
    // Fetch the image WITHOUT Referer, with appropriate headers
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        // Deliberately NOT setting Referer or Origin
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return c.json(
        { error: `Upstream returned ${response.status}` },
        response.status as 400,
      );
    }

    // Validate content type
    const contentType = response.headers.get("Content-Type") ?? "";
    const mimeBase = contentType.split(";")[0].trim().toLowerCase();

    if (!ALLOWED_TYPES.has(mimeBase)) {
      return c.json({ error: "Response is not an image" }, 400);
    }

    // Stream the image back with cache headers
    const cacheControl = "public, max-age=86400, s-maxage=604800"; // 1 day client, 7 days edge

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Access-Control-Allow-Origin": "*",
        "X-Proxy-Source": parsed.hostname,
      },
    });
  } catch (err) {
    return c.json(
      { error: "Failed to fetch image" },
      502,
    );
  }
});

export default app;

/** Check if a URL's domain needs proxying (has hotlink protection). */
export function needsProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return HOTLINK_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}
