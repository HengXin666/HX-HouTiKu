import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { FileText, Code2, Globe, FileJson } from "lucide-react";

SyntaxHighlighter.registerLanguage("json", json);

export type ContentFormat = "auto" | "markdown" | "html" | "json" | "text";

interface ContentRendererProps {
  content: string;
  format?: ContentFormat;
}

/** Detect content format heuristically — improved scoring system. */
function detectFormat(content: string): "markdown" | "html" | "json" | "text" {
  const trimmed = content.trim();

  if (!trimmed) return "text";

  // ── JSON: starts with { or [ and parses successfully ──
  if (/^[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not valid JSON, fall through
    }
  }

  // ── HTML: use a scoring approach instead of simple regex ──
  const htmlScore = (() => {
    let score = 0;
    // Block-level HTML tags are strong indicators
    const blockTags = /<(?:div|section|article|header|footer|main|nav|aside|table|thead|tbody|tfoot|tr|th|td|ul|ol|li|p|h[1-6]|form|fieldset|figure|figcaption|details|summary|blockquote|pre|dl|dt|dd)\b[^>]*>/gi;
    const blockMatches = trimmed.match(blockTags);
    if (blockMatches) score += blockMatches.length * 3;

    // Inline tags
    const inlineTags = /<(?:span|a|strong|em|b|i|u|br|img|code|sub|sup|abbr|mark|small|del|ins|s|q|cite|time|var|kbd|samp|ruby|rt|rp|bdo|wbr)\b[^>]*>/gi;
    const inlineMatches = trimmed.match(inlineTags);
    if (inlineMatches) score += inlineMatches.length * 2;

    // Closing tags
    const closingTags = /<\/(?:div|p|span|h[1-6]|ul|ol|li|table|tr|td|th|a|strong|em|section|article|header|footer|pre|code|blockquote|main|nav|aside|form|dl|dt|dd)\s*>/gi;
    const closingMatches = trimmed.match(closingTags);
    if (closingMatches) score += closingMatches.length * 2;

    // HTML attributes
    const attrPatterns = /\b(?:class|style|id|href|src|alt|title|data-\w+)\s*=/gi;
    const attrMatches = trimmed.match(attrPatterns);
    if (attrMatches) score += attrMatches.length;

    // DOCTYPE or html tag
    if (/<!doctype|<html\b/i.test(trimmed)) score += 20;

    return score;
  })();

  // ── Markdown: also scoring approach ──
  const mdScore = (() => {
    let score = 0;

    // Headings (very strong indicator)
    const headings = trimmed.match(/^#{1,6}\s+.+$/gm);
    if (headings) score += headings.length * 4;

    // Bold/italic
    const bold = trimmed.match(/\*\*[^*]+\*\*/g);
    if (bold) score += bold.length * 2;
    const italic = trimmed.match(/(?<!\*)\*[^*]+\*(?!\*)/g);
    if (italic) score += italic.length;

    // Links [text](url)
    const links = trimmed.match(/\[.+?\]\(.+?\)/g);
    if (links) score += links.length * 3;

    // Images ![alt](url)
    const images = trimmed.match(/!\[.*?\]\(.+?\)/g);
    if (images) score += images.length * 3;

    // Code blocks
    const codeBlocks = trimmed.match(/^```/gm);
    if (codeBlocks) score += codeBlocks.length * 3;

    // Inline code
    const inlineCode = trimmed.match(/`[^`]+`/g);
    if (inlineCode) score += inlineCode.length;

    // Lists
    const unorderedList = trimmed.match(/^[-*+]\s+.+$/gm);
    if (unorderedList) score += unorderedList.length * 2;
    const orderedList = trimmed.match(/^\d+\.\s+.+$/gm);
    if (orderedList) score += orderedList.length * 2;

    // Blockquotes
    const blockquotes = trimmed.match(/^>\s/gm);
    if (blockquotes) score += blockquotes.length * 2;

    // Tables
    const tables = trimmed.match(/\|.+\|.+\|/gm);
    if (tables) score += tables.length * 2;

    // Horizontal rules
    const hrs = trimmed.match(/^(?:---+|\*\*\*+|___+)\s*$/gm);
    if (hrs) score += hrs.length * 2;

    return score;
  })();

  // Decide based on scores
  const threshold = 3;

  if (htmlScore >= threshold && htmlScore > mdScore) return "html";
  if (mdScore >= threshold) return "markdown";
  if (htmlScore >= threshold) return "html";

  // For text that has paragraphs separated by blank lines, render as markdown
  // for better paragraph spacing
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

export function ContentRenderer({ content, format = "auto" }: ContentRendererProps) {
  const resolvedFormat = resolveFormat(content, format);

  switch (resolvedFormat) {
    case "json":
      return <JsonRenderer content={content} />;
    case "html":
      return <HtmlRenderer content={content} />;
    case "markdown":
      return <MarkdownRenderer content={content} />;
    case "text":
    default:
      return <TextRenderer content={content} />;
  }
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="msg-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ className, children, ...props }) {
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
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function HtmlRenderer({ content }: { content: string }) {
  return (
    <div
      className="msg-html"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
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
