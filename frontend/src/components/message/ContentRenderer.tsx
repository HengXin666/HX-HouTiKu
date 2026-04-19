import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("json", json);

interface ContentRendererProps {
  content: string;
  format?: "auto" | "markdown" | "html" | "json" | "text";
}

/** Detect content format heuristically. */
function detectFormat(content: string): "markdown" | "html" | "json" | "text" {
  const trimmed = content.trim();

  // JSON: starts with { or [
  if (/^[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not valid JSON, fall through
    }
  }

  // HTML: contains significant HTML tags
  if (/<(?:div|p|span|h[1-6]|ul|ol|table|br|img|a|strong|em|section|article|header|footer|pre|code)\b[^>]*>/i.test(trimmed)) {
    return "html";
  }

  // Markdown: contains common MD syntax
  if (
    /^#{1,6}\s/m.test(trimmed) ||           // headings
    /\*\*[^*]+\*\*/m.test(trimmed) ||        // bold
    /\[.+\]\(.+\)/m.test(trimmed) ||         // links
    /^[-*+]\s/m.test(trimmed) ||             // unordered list
    /^\d+\.\s/m.test(trimmed) ||             // ordered list
    /^```/m.test(trimmed) ||                 // code blocks
    /^>\s/m.test(trimmed) ||                 // blockquote
    /\|.+\|.+\|/m.test(trimmed)             // tables
  ) {
    return "markdown";
  }

  return "text";
}

export function ContentRenderer({ content, format = "auto" }: ContentRendererProps) {
  const resolvedFormat = format === "auto" ? detectFormat(content) : format;

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
                    fontSize: "0.8125em",
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
