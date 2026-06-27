"use client";

import { Check, Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { downloadFile, safeFileName } from "@/lib/export";
import {
  selectActiveDocument,
  useMindMapStore,
} from "@/store/mindMapStore";

type Tab = "json" | "markdown" | "outline";

const TABS: { id: Tab; label: string; ext: string; mime: string }[] = [
  { id: "json", label: "JSON", ext: "json", mime: "application/json" },
  { id: "markdown", label: "Markdown", ext: "md", mime: "text/markdown" },
  { id: "outline", label: "아웃라인", ext: "txt", mime: "text/plain" },
];

export function ExportDialog() {
  const open = useMindMapStore((s) => s.dialog === "export");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const doc = useMindMapStore(selectActiveDocument);
  const exportJson = useMindMapStore((s) => s.exportJson);
  const exportMarkdown = useMindMapStore((s) => s.exportMarkdown);
  const exportOutlineText = useMindMapStore((s) => s.exportOutlineText);
  const addToast = useMindMapStore((s) => s.addToast);

  const [tab, setTab] = useState<Tab>("json");
  const [copied, setCopied] = useState(false);

  const content = useMemo(() => {
    if (!open) return "";
    if (tab === "json") return exportJson();
    if (tab === "markdown") return exportMarkdown();
    return exportOutlineText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open]);

  const tabMeta = TABS.find((t) => t.id === tab)!;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      addToast("클립보드에 복사했습니다", "success");
    } catch {
      addToast("복사에 실패했습니다", "error");
    }
  };

  const handleDownload = () => {
    const name = `${safeFileName(doc?.title ?? "mindforge")}.${tabMeta.ext}`;
    downloadFile(name, content, tabMeta.mime);
    addToast(`${name} 저장됨`, "success");
  };

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="내보내기"
      description="현재 문서를 다양한 형식으로 내보냅니다."
      footer={
        <>
          <Button onClick={handleCopy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "복사됨" : "복사"}
          </Button>
          <Button variant="primary" onClick={handleDownload}>
            <Download size={15} /> 다운로드
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-xl border border-line bg-surface-base p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === t.id
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <pre className="max-h-[44vh] overflow-auto mf-scroll rounded-xl border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-soft whitespace-pre-wrap break-words">
        {content}
      </pre>
    </Modal>
  );
}
