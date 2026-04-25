/**
 * HX-HouTiKu — Cloudflare Email Worker SDK
 *
 * 在 Cloudflare 免费邮件转发中添加一个 hook:
 *   1. 收到邮件 → 解析邮件标题/发件人等元信息
 *   2. 调用 HX-HouTiKu /api/test-push 接口推送通知（服务端自动加密）
 *   3. 继续转发到目标邮箱（不影响原有邮件流）
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

export interface Env {
  /** HX-HouTiKu Worker API 地址, 如 https://houtiku.api.example.com */
  HOUTIKU_API_BASE: string;
  /** HX-HouTiKu 管理员令牌 (ADMIN_TOKEN) */
  HOUTIKU_TOKEN: string;
  /** 转发目标邮箱地址 */
  FORWARD_TO: string;
  /** 消息分组名, 默认 "email" */
  EMAIL_GROUP?: string;
  /** 默认消息优先级, 默认 "default", 可选: urgent/high/default/low/debug */
  EMAIL_PRIORITY?: string;
  /** 频道 ID, 默认 "email" */
  EMAIL_CHANNEL?: string;
  /**
   * 优先级规则 (JSON 字符串, 可选)
   * 格式: [{"match": "from:alert@example.com", "priority": "urgent"}, ...]
   * 支持的 match 前缀: from: / subject: / to:
   * 不带前缀则匹配 subject
   * 规则按顺序匹配, 命中第一条即停止
   */
  PRIORITY_RULES?: string;
}

interface PriorityRule {
  match: string;
  priority: string;
  group?: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get("subject") || "(无主题)";
    const date = message.headers.get("date") || new Date().toISOString();

    const { priority, group } = resolvePriorityAndGroup(env, from, to, subject);

    // 异步推送到 HX-HouTiKu (不阻塞邮件转发)
    ctx.waitUntil(
      pushToHoutiku(env, { from, to, subject, date, priority, group }).catch((err) => {
        console.error("HX-HouTiKu push failed:", err);
      })
    );

    // 继续转发到目标邮箱
    await message.forward(env.FORWARD_TO);
  },
};

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

  if (lower.startsWith("from:")) {
    return from.toLowerCase().includes(lower.slice(5).trim());
  }
  if (lower.startsWith("subject:")) {
    return subject.toLowerCase().includes(lower.slice(8).trim());
  }
  if (lower.startsWith("to:")) {
    return to.toLowerCase().includes(lower.slice(3).trim());
  }

  return subject.toLowerCase().includes(lower.trim());
}

async function pushToHoutiku(
  env: Env,
  email: {
    from: string;
    to: string;
    subject: string;
    date: string;
    priority: string;
    group: string;
  },
): Promise<void> {
  const title = `📧 ${email.subject}`;
  const body = [
    `**发件人**: ${email.from}`,
    `**收件人**: ${email.to}`,
    `**时间**: ${email.date}`,
  ].join("\n");

  // 使用 /api/test-push 接口, 服务端自动加密
  const resp = await fetch(`${env.HOUTIKU_API_BASE}/api/test-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.HOUTIKU_TOKEN}`,
    },
    body: JSON.stringify({
      title,
      body,
      priority: email.priority,
      group: email.group,
      channel_id: env.EMAIL_CHANNEL || "email",
      group_key: `email-${email.from}`,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Push failed: ${resp.status} ${text}`);
  }
}