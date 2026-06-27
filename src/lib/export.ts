import { walkTree } from "@/lib/tree";
import type { MindMapDocument } from "@/types/mindmap";

// ── JSON ─────────────────────────────────────────────────────────────────────
export function exportDocumentJson(doc: MindMapDocument): string {
  return JSON.stringify(
    {
      format: "mindforge-document",
      version: 1,
      document: doc,
    },
    null,
    2
  );
}

// ── Markdown (headings + nested bullets) ─────────────────────────────────────
export function exportMarkdown(doc: MindMapDocument): string {
  const lines: string[] = [`# ${doc.title || "Untitled"}`, ""];
  walkTree(doc.nodes, (node, depth) => {
    if (depth === 0) return; // root already used as title
    const indent = "  ".repeat(Math.max(0, depth - 1));
    const status =
      node.data.status && node.data.status !== "none"
        ? ` \`${node.data.status}\``
        : "";
    const tags =
      node.data.tags && node.data.tags.length
        ? " " + node.data.tags.map((t) => `#${t}`).join(" ")
        : "";
    const link = node.data.link ? ` ([link](${node.data.link}))` : "";
    lines.push(`${indent}- ${node.data.label}${status}${tags}${link}`);
    if (node.data.description) {
      lines.push(`${indent}  > ${node.data.description.replace(/\n/g, " ")}`);
    }
    if (node.data.checklist?.length) {
      for (const item of node.data.checklist) {
        lines.push(
          `${indent}  - [${item.checked ? "x" : " "}] ${item.text}`
        );
      }
    }
  });
  return lines.join("\n");
}

// ── Plain text outline ───────────────────────────────────────────────────────
export function exportOutlineText(doc: MindMapDocument): string {
  const lines: string[] = [];
  walkTree(doc.nodes, (node, depth) => {
    const indent = "    ".repeat(depth);
    lines.push(`${indent}${node.data.label}`);
  });
  return lines.join("\n");
}

// Trigger a client-side file download.
export function downloadFile(
  filename: string,
  content: string,
  mime = "text/plain"
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function safeFileName(title: string): string {
  return (
    title
      .trim()
      .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
      .replace(/\s+/g, "-")
      .toLowerCase() || "mindforge"
  );
}
