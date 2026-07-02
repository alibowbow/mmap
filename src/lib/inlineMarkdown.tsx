import type { ReactNode } from "react";

// Minimal inline-markdown renderer for node labels.
// Supports **bold**, *italic*, `code`, ==highlight==, ~~strike~~.
// Editing always shows the raw text; this only affects display.

const TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|==[^=\n]+==|~~[^~\n]+~~)/g;

export function hasInlineMarkdown(text: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text);
}

export function renderInlineMarkdown(text: string): ReactNode {
  if (!text) return text;
  TOKEN.lastIndex = 0;
  const parts = text.split(TOKEN);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      return (
        <mark key={i} className="rounded bg-brand/20 px-0.5 text-inherit">
          {part.slice(2, -2)}
        </mark>
      );
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return (
        <s key={i} className="opacity-70">
          {part.slice(2, -2)}
        </s>
      );
    }
    return part;
  });
}
