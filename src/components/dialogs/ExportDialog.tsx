"use client";

import { Check, Copy, Download, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { downloadFile, safeFileName } from "@/lib/export";
import { renderCanvasImage, type ImageFormat } from "@/lib/image";
import {
  selectActiveDocument,
  useMindMapStore,
} from "@/store/mindMapStore";

type Tab = "json" | "markdown" | "outline" | "png" | "svg";

const TABS: {
  id: Tab;
  label: string;
  ext: string;
  mime: string;
  kind: "text" | "image";
}[] = [
  { id: "json", label: "JSON", ext: "json", mime: "application/json", kind: "text" },
  { id: "markdown", label: "Markdown", ext: "md", mime: "text/markdown", kind: "text" },
  { id: "outline", label: "아웃라인", ext: "txt", mime: "text/plain", kind: "text" },
  { id: "png", label: "PNG", ext: "png", mime: "image/png", kind: "image" },
  { id: "svg", label: "SVG", ext: "svg", mime: "image/svg+xml", kind: "image" },
];

// Trigger a download from a data URL (used for image exports).
function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function ExportDialog() {
  const open = useMindMapStore((s) => s.dialog === "export");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const doc = useMindMapStore(selectActiveDocument);
  const nodes = useMindMapStore((s) => s.nodes);
  const exportJson = useMindMapStore((s) => s.exportJson);
  const exportMarkdown = useMindMapStore((s) => s.exportMarkdown);
  const exportOutlineText = useMindMapStore((s) => s.exportOutlineText);
  const addToast = useMindMapStore((s) => s.addToast);

  const [tab, setTab] = useState<Tab>("json");
  const [copied, setCopied] = useState(false);

  // Image-export state.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const tabMeta = TABS.find((t) => t.id === tab)!;
  const isImage = tabMeta.kind === "image";

  const textContent = useMemo(() => {
    if (!open || isImage) return "";
    if (tab === "json") return exportJson();
    if (tab === "markdown") return exportMarkdown();
    return exportOutlineText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open, isImage]);

  const generateImage = useCallback(async () => {
    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);
    try {
      const url = await renderCanvasImage(nodes, tab as ImageFormat);
      setImageUrl(url);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "이미지 생성 실패");
    } finally {
      setImageLoading(false);
    }
  }, [nodes, tab]);

  // Auto-generate when an image tab becomes active.
  useEffect(() => {
    if (open && isImage) generateImage();
    if (!isImage) {
      setImageUrl(null);
      setImageError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      addToast("클립보드에 복사했습니다", "success");
    } catch {
      addToast("복사에 실패했습니다", "error");
    }
  };

  const handleDownload = () => {
    const name = `${safeFileName(doc?.title ?? "mindforge")}.${tabMeta.ext}`;
    if (isImage) {
      if (!imageUrl) return;
      downloadDataUrl(name, imageUrl);
    } else {
      downloadFile(name, textContent, tabMeta.mime);
    }
    addToast(`${name} 저장됨`, "success");
  };

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="내보내기"
      description="현재 문서를 다양한 형식으로 내보냅니다."
      className="sm:max-w-xl"
      footer={
        <>
          {!isImage && (
            <Button onClick={handleCopy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "복사됨" : "복사"}
            </Button>
          )}
          {isImage && (
            <Button onClick={generateImage} disabled={imageLoading}>
              <RefreshCw size={15} /> 다시 생성
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={isImage && !imageUrl}
          >
            <Download size={15} /> 다운로드
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex flex-wrap rounded-xl border border-line bg-surface-base p-1">
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

      {isImage ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-line bg-surface-sunken p-3">
          {imageLoading && (
            <div className="flex flex-col items-center gap-2 text-ink-soft">
              <Loader2 size={26} className="animate-spin" />
              <span className="text-sm">이미지 생성 중…</span>
            </div>
          )}
          {!imageLoading && imageError && (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <ImageIcon size={26} />
              <span className="text-sm">{imageError}</span>
            </div>
          )}
          {!imageLoading && imageUrl && (
            <img
              src={imageUrl}
              alt="마인드맵 미리보기"
              className="max-h-[44vh] w-auto max-w-full rounded-lg shadow-soft"
            />
          )}
        </div>
      ) : (
        <pre className="max-h-[44vh] overflow-auto mf-scroll rounded-xl border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-soft whitespace-pre-wrap break-words">
          {textContent}
        </pre>
      )}
    </Modal>
  );
}
