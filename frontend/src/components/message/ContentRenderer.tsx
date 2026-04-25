import { useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { FileText, Code2, Globe, FileJson } from "lucide-react";
import DOMPurify from "dompurify";
import { getApiBase } from "@/lib/api";

SyntaxHighlighter.registerLanguage("json", json);

// ═══════════════════════════════════════════════════════════════════════════
//  Image proxy — route external images through our Worker to bypass
//  Referer-based hotlink protection (Bilibili, Weibo, etc.)
// ═══════════════════════════════════════════════════════════════════════════

/** Cached API base for building proxy URLs (initialized lazily). */
let cachedApiBase: string | null = null;
getApiBase().then((base) => { cachedApiBase = base; });

/**
 * Convert an image URL to go through our image proxy.
 * This strips the Referer header so hotlink-protected images load correctly.
 */
function proxyImageUrl(src: string | undefined): string | undefined {
  if (!src) return src;

  // Don't proxy data URIs, blob URIs, or cid: references
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("cid:")) return src;

  // Don't proxy our own API
  if (cachedApiBase && src.startsWith(cachedApiBase)) return src;

  // Force HTTPS
  const safeSrc = src.replace(/^http:\/\//, "https://");

  // Build proxy URL
  const base = cachedApiBase || "";
  return `${base}/api/image-proxy?url=${encodeURIComponent(safeSrc)}`;
}

/**
 * Rewrite all image src attributes in an HTML string to use the proxy.
 */
function proxyHtmlImages(html: string): string {
  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
    (_match, prefix, url, suffix) => {
      const proxied = proxyImageUrl(url);
      return `${prefix}${proxied}${suffix}`;
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Format detection
// ═══════════════════════════════════════════════════════════════════════════

export type ContentFormat = "auto" | "markdown" | "html" | "json" | "text";

/** Detect content format heuristically — improved scoring system. */
function detectFormat(content: string): "markdown" | "html" | "json" | "text" {
  const trimmed = content.trim();
  if (!trimmed) return "text";

  // JSON: starts with { or [ and parses successfully
  if (/^[\[{]/.test(trimmed)) {
    try { JSON.parse(trimmed); return "json"; } catch { /* fall through */ }
  }

  // HTML scoring
  const htmlScore = (() => {
    let score = 0;
    const blockTags = /<(?:div|section|article|header|footer|main|nav|aside|table|thead|tbody|tfoot|tr|th|td|ul|ol|li|p|h[1-6]|form|fieldset|figure|figcaption|details|summary|blockquote|pre|dl|dt|dd)\b[^>]*>/gi;
    const blockMatches = trimmed.match(blockTags);
    if (blockMatches) score += blockMatches.length * 3;

    const inlineTags = /<(?:span|a|strong|em|b|i|u|br|img|code|sub|sup|abbr|mark|small|del|ins|s|q|cite|time|var|kbd|samp|ruby|rt|rp|bdo|wbr)\b[^>]*>/gi;
    const inlineMatches = trimmed.match(inlineTags);
    if (inlineMatches) score += inlineMatches.length * 2;

    const closingTags = /<\/(?:div|p|span|h[1-6]|ul|ol|li|table|tr|td|th|a|strong|em|section|article|header|footer|pre|code|blockquote|main|nav|aside|form|dl|dt|dd)\s*>/gi;
    const closingMatches = trimmed.match(closingTags);
    if (closingMatches) score += closingMatches.length * 2;

    const attrPatterns = /\b(?:class|style|id|href|src|alt|title|data-\w+)\s*=/gi;
    const attrMatches = trimmed.match(attrPatterns);
    if (attrMatches) score += attrMatches.length;

    if (/<!doctype|<html\b/i.test(trimmed)) score += 20;
    return score;
  })();

  // Markdown scoring
  const mdScore = (() => {
    let score = 0;
    const headings = trimmed.match(/^#{1,6}\s+.+$/gm);
    if (headings) score += headings.length * 4;

    const bold = trimmed.match(/\*\*[^*]+\*\*/g);
    if (bold) score += bold.length * 2;
    const italic = trimmed.match(/(?<!\*)\*[^*]+\*(?!\*)/g);
    if (italic) score += italic.length;

    const links = trimmed.match(/\[.+?\]\(.+?\)/g);
    if (links) score += links.length * 3;

    const images = trimmed.match(/!\[.*?\]\(.+?\)/g);
    if (images) score += images.length * 3;

    const codeBlocks = trimmed.match(/^```/gm);
    if (codeBlocks) score += codeBlocks.length * 3;

    const inlineCode = trimmed.match(/`[^`]+`/g);
    if (inlineCode) score += inlineCode.length;

    const unorderedList = trimmed.match(/^[-*+]\s+.+$/gm);
    if (unorderedList) score += unorderedList.length * 2;
    const orderedList = trimmed.match(/^\d+\.\s+.+$/gm);
    if (orderedList) score += orderedList.length * 2;

    const blockquotes = trimmed.match(/^>\s/gm);
    if (blockquotes) score += blockquotes.length * 2;

    const tables = trimmed.match(/\|.+\|.+\|/gm);
    if (tables) score += tables.length * 2;

    const hrs = trimmed.match(/^(?:---+|\*\*\*+|___+)\s*$/gm);
    if (hrs) score += hrs.length * 2;

    return score;
  })();

  const threshold = 3;
  if (htmlScore >= threshold && htmlScore > mdScore) return "html";
  if (mdScore >= threshold) return "markdown";
  if (htmlScore >= threshold) return "html";
  if (/\n\s*\n/.test(trimmed)) return "markdown";
  return "text";
}

/** Get a readable label + icon for each format. */
export function getFormatInfo(format: ContentFormat) {
  switch (format) {
    case "markdown": return { label: "Markdown", Icon: FileText };
    case "html": return { label: "HTML", Icon: Globe };
    case "json": return { label: "JSON", Icon: FileJson };
    case "text": return { label: "纯文本", Icon: FileText };
    default: return { label: "自动", Icon: Code2 };
  }
}

/** Resolve the effective format of a content string. */
export function resolveFormat(content: string, format: ContentFormat = "auto"): "markdown" | "html" | "json" | "text" {
  return format === "auto" ? detectFormat(content) : format;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Renderers
// ═══════════════════════════════════════════════════════════════════════════

export function ContentRenderer({ content, format = "auto" }: { content: string; format?: ContentFormat }) {
  const resolvedFormat = resolveFormat(content, format);

  switch (resolvedFormat) {
    case "json":    return <JsonRenderer content={content} />;
    case "html":    return <HtmlRenderer content={content} />;
    case "markdown": return <MarkdownRenderer content={content} />;
    case "text":
    default:        return <TextRenderer content={content} />;
  }
}

function MarkdownRenderer({ content }: { content: string }) {
  const components = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (): Record<string, React.ComponentType<any>> => ({
      code({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: unknown }) {
        const match = /language-(\w+)/.exec(className || "");
        const codeStr = String(children).replace(/\n$/, "");
        if (match) {
          return (
            <SyntaxHighlighter
              style={atomOneDark}
              language={match[1]}
              PreTag="div"
              customStyle={{
                borderRadius: "12px",
                padding: "1em",
                margin: "0.75em 0",
                fontSize: "0.875em",
                background: "var(--color-muted)",
              }}
            >
              {codeStr}
            </SyntaxHighlighter>
          );
        }
        return <code className={className} {...props}>{children}</code>;
      },
      img({ src, alt, ...props }: { src?: string; alt?: string; [key: string]: unknown }) {
        const proxiedSrc = proxyImageUrl(src);
        return (
          <img
            src={proxiedSrc}
            alt={alt ?? ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(e) => {
              // Fallback: try original URL if proxy fails
              const target = e.currentTarget;
              if (src && target.src !== src) {
                target.src = src;
              }
            }}
            {...props}
          />
        );
      },
    }),
    [],
  );

  return (
    <div className="msg-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Shadow DOM styles for isolated HTML rendering.
 */
const SHADOW_STYLES = `
  :host {
    display: block;
    line-height: 1.75;
    word-break: break-word;
    font-size: 1rem;
    color: inherit;
    font-family: inherit;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  a { color: #1d9bf0; text-decoration: none; }
  a:hover { text-decoration: underline; }
  pre {
    background: rgba(0,0,0,0.15);
    border-radius: 12px;
    padding: 1em;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0.75em 0;
    font-family: ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
    font-size: 0.9em;
  }
  code {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
    font-size: 0.9em;
  }
`;

function HtmlRenderer({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!shadowRef.current) {
      shadowRef.current = host.attachShadow({ mode: "open" });
    }
    const shadow = shadowRef.current;

    // Proxy all image URLs in the HTML content, then sanitize
    const proxiedHtml = proxyHtmlImages(content);
    const safeHtml = DOMPurify.sanitize(proxiedHtml, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target", "rel", "referrerpolicy", "crossorigin"],
      ADD_DATA_URI_TAGS: ["img"],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    });
    shadow.innerHTML = `<style>${SHADOW_STYLES}</style>${safeHtml}`;

    // Also set referrerPolicy on all images in shadow DOM
    const images = shadow.querySelectorAll("img");
    images.forEach((img) => {
      img.referrerPolicy = "no-referrer";
      img.crossOrigin = "anonymous";
    });
  }, [content]);

  return <div ref={hostRef} className="msg-html" />;
}

function JsonRenderer({ content }: { content: string }) {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    formatted = content;
  }
  return (
    <div className="msg-json">
      <SyntaxHighlighter
        style={atomOneDark}
        language="json"
        customStyle={{
          background: "transparent",
          padding: 0,
          margin: 0,
          fontSize: "inherit",
        }}
      >
        {formatted}
      </SyntaxHighlighter>
    </div>
  );
}

function TextRenderer({ content }: { content: string }) {
  return <div className="msg-text">{content}</div>;
}
