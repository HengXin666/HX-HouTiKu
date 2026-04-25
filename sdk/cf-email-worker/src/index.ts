/**
 * HX-HouTiKu — Cloudflare Email Worker SDK
 *
 * 在 Cloudflare 免费邮件转发中添加一个 hook:
 *   1. 收到邮件 → 用 postal-mime 解析完整邮件 (发件人/正文/附件等)
 *   2. 智能识别 GitHub 通知邮件, 按 Issue/PR/Workflow 等分类推送
 *   3. 调用 HX-HouTiKu /api/test-push 接口推送通知（服务端自动加密）
 *   4. 继续转发到目标邮箱（不影响原有邮件流）
 *
 * 为什么使用 /api/test-push 而不是 /api/push:
 *   CF Workers 的 Web Crypto API 不支持 secp256k1 曲线,
 *   无法在 Email Worker 中执行 ECIES 加密。
 *   /api/test-push 接口接受明文, 由 HX-HouTiKu 后端负责加密后推送。
 *
 * CF 免费额度:
 *   - Email Routing: 免费, 无限转发
 *   - Email Worker: 每次邮件触发一次 Worker 调用, 计入 Workers 免费额度(10万/天)
 *   - 实际使用中, 邮件量远低于此限制
 */

import PostalMime from "postal-mime";

export interface Env {
  HOUTIKU_API_BASE: string;
  HOUTIKU_TOKEN: string;
  FORWARD_TO: string;
  EMAIL_GROUP?: string;
  EMAIL_PRIORITY?: string;
  EMAIL_CHANNEL?: string;
  PRIORITY_RULES?: string;
}

interface PriorityRule {
  match: string;
  priority: string;
  group?: string;
}

interface ParsedEmail {
  from: string;
  fromDisplay: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  isHtml: boolean;
  attachments: { filename: string; size: number }[];
  headers: Map<string, string>;
  cidMap: Map<string, string>; // contentId -> data URI
}

// GitHub 通知解析结果
interface GitHubInfo {
  repo: string;       // owner/repo
  type: string;       // issue / pr / workflow / release / discussion / push / star / ...
  action: string;     // opened / closed / merged / commented / ...
  number: string;     // #123
  author: string;     // 操作者
  title: string;      // 推送标题
  priority: string;
  group: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(rawEmail);

    // 获取真实发件人 (避免 Cloudflare SRS 重写地址)
    // postal-mime 解析的 from 可能已经是 SRS 地址, 所以所有来源都需要经过 SRS 解析
    const parsedFromAddr = parsed.from?.address || "";
    const mimeFromHeader = message.headers.get("from") || "";
    const envelopeFrom = message.from;

    // 按优先级尝试获取真实发件人:
    // 1. Reply-To / X-Original-From 头
    // 2. postal-mime 解析的 From (如果不是 SRS)
    // 3. MIME From 头 (如果不是 SRS)
    // 4. 对 SRS 地址进行反向解析
    // 5. envelope sender
    const from = resolveRealFrom(parsedFromAddr, mimeFromHeader, envelopeFrom, message.headers);
    const fromName = parsed.from?.name || "";
    const fromDisplay = fromName ? `${fromName} <${from}>` : from;
    const to = message.to;
    const subject = parsed.subject || message.headers.get("subject") || "(无主题)";
    const date = parsed.date || message.headers.get("date") || new Date().toISOString();

    const emailBody = parsed.text || parsed.html || "";
    const isHtml = !parsed.text && !!parsed.html;

    // 构建 CID -> data URI 映射 (内嵌图片)
    const cidMap = new Map<string, string>();
    const realAttachments: { filename: string; size: number }[] = [];
    for (const a of parsed.attachments || []) {
      if (a.contentId && a.mimeType?.startsWith("image/")) {
        // 内嵌图片: 转为 base64 data URI
        const b64 = arrayBufferToBase64(a.content as ArrayBuffer);
        const cid = a.contentId.replace(/^<|>$/g, "");
        cidMap.set(cid, `data:${a.mimeType};base64,${b64}`);
      } else {
        // 真正的附件
        realAttachments.push({
          filename: a.filename || "未命名附件",
          size: typeof a.content === "string" ? a.content.length : (a.content?.byteLength ?? 0),
        });
      }
    }

    // 收集邮件头 (用于 GitHub 解析)
    const headerMap = new Map<string, string>();
    for (const h of parsed.headers || []) {
      headerMap.set(h.key.toLowerCase(), h.value);
    }

    const email: ParsedEmail = {
      from, fromDisplay, to, subject, date,
      body: emailBody, isHtml, attachments: realAttachments,
      headers: headerMap, cidMap,
    };

    // 判断是否为 GitHub 通知邮件
    const ghInfo = parseGitHubEmail(email);

    let title: string;
    let body: string;
    let priority: string;
    let group: string;
    let groupKey: string;

    if (ghInfo) {
      title = ghInfo.title;
      body = buildGitHubBody(email, ghInfo);
      priority = ghInfo.priority;
      group = ghInfo.group;
      groupKey = `gh-${ghInfo.repo}-${ghInfo.type}`;
    } else {
      const resolved = resolvePriorityAndGroup(env, from, to, subject);
      title = `📧 ${subject}`;
      body = buildGenericBody(email);
      priority = resolved.priority;
      group = resolved.group;
      groupKey = `email-${from}`;
    }

    ctx.waitUntil(
      pushToHoutiku(env, { title, body, priority, group, groupKey }).catch((err) => {
        console.error("HX-HouTiKu push failed:", err);
      })
    );

    await message.forward(env.FORWARD_TO);
  },
};

// GitHub 通知邮件解析
function parseGitHubEmail(email: ParsedEmail): GitHubInfo | null {
  const from = email.from.toLowerCase();
  const msgId = email.headers.get("message-id") || "";

  // GitHub 通知邮件特征: 来自 notifications@github.com, 或 Message-ID 含 github.com
  const isGitHub = from.includes("@github.com") || msgId.includes("github.com");
  if (!isGitHub) return null;

  const subject = email.subject;
  const listId = email.headers.get("list-id") || "";
  const xGhReason = (email.headers.get("x-github-reason") || "").toLowerCase();

  // 从 List-Id 提取 repo: 格式如 "owner/repo <repo.owner.github.com>"
  let repo = "";
  const listMatch = listId.match(/^([^<]+)</);
  if (listMatch) {
    repo = listMatch[1].trim();
  }
  if (!repo) {
    // 从 Message-ID 提取: <owner/repo/...@github.com>
    const midMatch = msgId.match(/<([^/]+\/[^/]+)\//);
    if (midMatch) repo = midMatch[1];
  }

  // 从 subject 提取作者 (GitHub 邮件 From 头通常是 "Author <notifications@github.com>")
  const author = email.headers.get("x-github-sender") || (email.fromDisplay.match(/^([^<]+)/)?.[1]?.trim()) || "";

  // 解析事件类型和编号
  let type = "notification";
  let action = "";
  let number = "";

  // Re: [owner/repo] Subject (PR #123)
  const numMatch = subject.match(/#(\d+)/);
  if (numMatch) number = `#${numMatch[1]}`;

  const subjectLower = subject.toLowerCase();

  if (subjectLower.includes("pull request") || /\(pr #\d+\)/.test(subjectLower) || /re: \[.*\] .*#\d+/.test(subjectLower) && isPrSubject(subjectLower)) {
    type = "pr";
  } else if (subjectLower.includes("issue") || (number && !subjectLower.includes("pull"))) {
    type = "issue";
  }

  // 从 subject 推断 action
  if (subjectLower.includes("opened")) action = "opened";
  else if (subjectLower.includes("closed")) action = "closed";
  else if (subjectLower.includes("merged")) action = "merged";
  else if (subjectLower.includes("reopened")) action = "reopened";
  else if (subjectLower.includes("commented")) action = "commented";
  else if (subjectLower.includes("review requested")) action = "review_requested";
  else if (subjectLower.includes("approved")) action = "approved";
  else if (subjectLower.includes("changes requested")) action = "changes_requested";

  // 更精确的类型判断 (基于 Message-ID 路径)
  if (msgId.includes("/pull/")) type = "pr";
  else if (msgId.includes("/issues/")) type = "issue";
  else if (msgId.includes("/runs/") || msgId.includes("/actions/")) type = "workflow";
  else if (msgId.includes("/releases/")) type = "release";
  else if (msgId.includes("/discussions/")) type = "discussion";
  else if (msgId.includes("/commit/")) type = "push";

  // Workflow run 特殊处理
  if (subjectLower.includes("run failed") || subjectLower.includes("run cancelled")) {
    type = "workflow";
    action = "failed";
  } else if (subjectLower.includes("run completed") || subjectLower.includes("run succeeded")) {
    type = "workflow";
    action = "success";
  }

  // Release
  if (subjectLower.includes("release") && (subjectLower.includes("published") || subjectLower.includes("created"))) {
    type = "release";
    action = "published";
  }

  // 构建推送标题
  const repoShort = repo.includes("/") ? repo.split("/")[1] : repo;
  const title = buildGitHubTitle(type, action, repoShort, number, subject, author);

  // 分配优先级和分组
  const { priority, group } = resolveGitHubPriority(type, action, xGhReason);

  return { repo, type, action, number, author, title, priority, group };
}

function isPrSubject(s: string): boolean {
  return s.includes("pull") || s.includes("pr ") || s.includes("merge");
}

function buildGitHubTitle(
  type: string, action: string, repo: string,
  number: string, subject: string, author: string,
): string {
  const icons: Record<string, string> = {
    pr: "🔀", issue: "🐛", workflow: "⚙️", release: "🏷️",
    discussion: "💬", push: "📌", notification: "🔔",
  };
  const icon = icons[type] || "🔔";

  switch (type) {
    case "pr": {
      const act = action === "merged" ? "合并" : action === "opened" ? "新建"
        : action === "closed" ? "关闭" : action === "commented" ? "评论"
        : action === "review_requested" ? "请求审查"
        : action === "approved" ? "批准" : action === "changes_requested" ? "请求修改"
        : action || "更新";
      return `${icon} [${repo}] PR ${number} ${act}${author ? ` · ${author}` : ""}`;
    }
    case "issue": {
      const act = action === "opened" ? "新建" : action === "closed" ? "关闭"
        : action === "commented" ? "评论" : action === "reopened" ? "重新打开"
        : action || "更新";
      return `${icon} [${repo}] Issue ${number} ${act}${author ? ` · ${author}` : ""}`;
    }
    case "workflow": {
      const act = action === "failed" ? "❌ 失败" : action === "success" ? "✅ 成功" : "运行";
      return `${icon} [${repo}] 工作流${act}`;
    }
    case "release":
      return `${icon} [${repo}] 新版本发布${author ? ` · ${author}` : ""}`;
    case "discussion":
      return `${icon} [${repo}] Discussion ${number}${author ? ` · ${author}` : ""}`;
    default:
      // 回退: 直接用原始 subject
      return `${icon} ${subject}`;
  }
}

function resolveGitHubPriority(
  type: string, action: string, reason: string,
): { priority: string; group: string } {
  // 工作流失败 → high
  if (type === "workflow" && action === "failed") {
    return { priority: "high", group: "github-ci" };
  }
  // 工作流成功 → low
  if (type === "workflow" && action === "success") {
    return { priority: "low", group: "github-ci" };
  }
  // 被 @mention 或 review_requested → high
  if (reason === "mention" || reason === "review_requested" || reason === "assign") {
    return { priority: "high", group: "github" };
  }
  // PR/Issue 新建 → default
  if ((type === "pr" || type === "issue") && action === "opened") {
    return { priority: "default", group: "github" };
  }
  // PR 合并 → default
  if (type === "pr" && action === "merged") {
    return { priority: "default", group: "github" };
  }
  // Release → default
  if (type === "release") {
    return { priority: "default", group: "github" };
  }
  // 其他评论/更新 → low
  return { priority: "low", group: "github" };
}

// 构建 GitHub 邮件推送正文
function buildGitHubBody(email: ParsedEmail, gh: GitHubInfo): string {
  const timeStr = formatBeijingTime(email.date);
  const parts: string[] = [];

  parts.push(`<p><b>仓库</b>: ${escapeHtml(gh.repo)}</p>`);
  if (gh.author) parts.push(`<p><b>操作者</b>: ${escapeHtml(gh.author)}</p>`);
  parts.push(`<p><b>时间</b>: 北京时间 ${escapeHtml(timeStr)}</p>`);

  // 附件提示
  if (email.attachments.length > 0) {
    const names = email.attachments.map((a) => escapeHtml(a.filename)).join(", ");
    parts.push(`<p>📎 <b>附件</b>: ${names} (请到邮箱查看)</p>`);
  }

  // 邮件正文
  if (email.body) {
    if (email.isHtml) {
      parts.push(`<hr/>\n${replaceCidImages(email.body, email.cidMap)}`);
    } else {
      parts.push(`<hr/>\n<pre>${escapeHtml(email.body)}</pre>`);
    }
  }

  return parts.join("\n");
}

// 构建普通邮件推送正文
function buildGenericBody(email: ParsedEmail): string {
  const timeStr = formatBeijingTime(email.date);
  const parts: string[] = [];

  parts.push(`<p><b>发件人</b>: ${escapeHtml(email.fromDisplay)}</p>`);
  parts.push(`<p><b>收件人</b>: ${escapeHtml(email.to)}</p>`);
  parts.push(`<p><b>时间</b>: 北京时间 ${escapeHtml(timeStr)}</p>`);

  // 附件提示
  if (email.attachments.length > 0) {
    const names = email.attachments.map((a) => escapeHtml(a.filename)).join(", ");
    parts.push(`<p>📎 <b>附件</b>: ${names} (请到邮箱查看)</p>`);
  }

  // 邮件正文
  if (email.body) {
    if (email.isHtml) {
      parts.push(`<hr/>\n${replaceCidImages(email.body, email.cidMap)}`);
    } else {
      parts.push(`<hr/>\n<pre>${escapeHtml(email.body)}</pre>`);
    }
  }

  return parts.join("\n");
}

// 将 HTML 中的 cid: 引用替换为 base64 data URI
function replaceCidImages(html: string, cidMap: Map<string, string>): string {
  if (cidMap.size === 0) return html;
  return html.replace(
    /(["'])cid:([^"']+)(["'])/gi,
    (_match, q1, cid, q2) => {
      const dataUri = cidMap.get(cid);
      return dataUri ? `${q1}${dataUri}${q2}` : `${q1}cid:${cid}${q2}`;
    },
  );
}

// ArrayBuffer 转 base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resolvePriorityAndGroup(
  env: Env,
  from: string,
  to: string,
  subject: string,
): { priority: string; group: string } {
  let priority = env.EMAIL_PRIORITY || "default";
  let group = env.EMAIL_GROUP || "email";

  if (!env.PRIORITY_RULES) return { priority, group };

  try {
    const rules: PriorityRule[] = JSON.parse(env.PRIORITY_RULES);
    for (const rule of rules) {
      if (matchRule(rule.match, from, to, subject)) {
        priority = rule.priority || priority;
        group = rule.group || group;
        break;
      }
    }
  } catch (err) {
    console.error("Failed to parse PRIORITY_RULES:", err);
  }

  return { priority, group };
}

function matchRule(pattern: string, from: string, to: string, subject: string): boolean {
  const lower = pattern.toLowerCase();
  if (lower.startsWith("from:")) return from.toLowerCase().includes(lower.slice(5).trim());
  if (lower.startsWith("subject:")) return subject.toLowerCase().includes(lower.slice(8).trim());
  if (lower.startsWith("to:")) return to.toLowerCase().includes(lower.slice(3).trim());
  return subject.toLowerCase().includes(lower.trim());
}

function formatBeijingTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

async function pushToHoutiku(
  env: Env,
  msg: {
    title: string;
    body: string;
    priority: string;
    group: string;
    groupKey: string;
  },
): Promise<void> {
  const resp = await fetch(`${env.HOUTIKU_API_BASE}/api/test-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.HOUTIKU_TOKEN}`,
    },
    body: JSON.stringify({
      title: msg.title,
      body: msg.body,
      priority: msg.priority,
      group: msg.group,
      channel_id: env.EMAIL_CHANNEL || "email",
      group_key: msg.groupKey,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Push failed: ${resp.status} ${text}`);
  }
}

// 从多个来源中解析出真实发件人地址
function resolveRealFrom(
  parsedFromAddr: string,
  mimeFromHeader: string,
  envelopeFrom: string,
  headers: Headers,
): string {
  // 1. 尝试从 Reply-To 头获取
  const replyTo = headers.get("reply-to");
  if (replyTo) {
    const addr = extractEmailAddr(replyTo);
    if (addr && !isSrsAddress(addr)) return addr;
  }

  // 2. 尝试从 X-Original-From 头获取
  const xOriginal = headers.get("x-original-from");
  if (xOriginal) {
    const addr = extractEmailAddr(xOriginal);
    if (addr && !isSrsAddress(addr)) return addr;
  }

  // 3. postal-mime 解析的 From, 如果不是 SRS 就直接用
  if (parsedFromAddr && !isSrsAddress(parsedFromAddr)) {
    return parsedFromAddr;
  }

  // 4. MIME From 头, 提取邮箱地址, 如果不是 SRS 就用
  if (mimeFromHeader) {
    const addr = extractEmailAddr(mimeFromHeader);
    if (addr && !isSrsAddress(addr)) return addr;
  }

  // 5. 对所有可能的 SRS 地址尝试反向解析
  for (const candidate of [parsedFromAddr, mimeFromHeader, envelopeFrom]) {
    const addr = extractEmailAddr(candidate) || candidate;
    const resolved = parseSrsAddress(addr);
    if (resolved) return resolved;
  }

  // 6. 回退
  return parsedFromAddr || envelopeFrom;
}

// 判断是否为 SRS 重写地址
function isSrsAddress(addr: string): boolean {
  const local = addr.split("@")[0].toLowerCase();
  return local.startsWith("srs0=") || local.startsWith("srs1=");
}

// 从 "Name <email@example.com>" 或 "email@example.com" 中提取邮箱地址
function extractEmailAddr(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1];
  const addrMatch = raw.match(/[\w.+-]+@[\w.-]+/);
  return addrMatch ? addrMatch[0] : null;
}

// 解析 SRS (Sender Rewriting Scheme) 地址
// 格式: srs0=hash=tt=original-domain=original-user@forwarding-domain
// 例如: srs0=cutu=yc=qq.com=hxloli@woa.qzz.io → hxloli@qq.com
function parseSrsAddress(addr: string): string | null {
  if (!isSrsAddress(addr)) return null;

  // 取 @ 前面的 local part: srs0=hash=tt=domain=user
  const localPart = addr.split("@")[0];
  const parts = localPart.split("=");
  // parts: ["srs0", "hash", "tt", "domain", "user", ...]
  if (parts.length >= 5) {
    const originalDomain = parts[3];
    const originalUser = parts.slice(4).join("="); // 用户名可能含 =
    if (originalDomain && originalUser) {
      return `${originalUser}@${originalDomain}`;
    }
  }
  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}