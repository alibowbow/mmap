"use client";

import { FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { parseImportJson, summarizeDocument } from "@/lib/validation";
import { useMindMapStore } from "@/store/mindMapStore";

export function ImportJsonDialog() {
  const open = useMindMapStore((s) => s.dialog === "import");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const importJson = useMindMapStore((s) => s.importJson);

  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Live preview / validation feedback.
  const preview = text.trim() ? parseImportJson(text) : null;
  const summary =
    preview && preview.ok ? summarizeDocument(preview.document) : null;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (importJson(text)) {
      setText("");
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setDialog(null);
        setText("");
      }}
      title="JSON 가져오기"
      description="MindForge JSON을 붙여넣거나 파일을 선택하세요."
      footer={
        <>
          <Button
            onClick={() => {
              setDialog(null);
              setText("");
            }}
          >
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!preview?.ok}
            onClick={handleImport}
          >
            <Upload size={15} /> 가져오기
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-base py-6 text-sm text-ink-soft transition hover:border-brand/50 hover:text-ink"
        >
          <FileUp size={18} /> JSON 파일 선택
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "document": { ... } }'
          className="min-h-[160px] font-mono text-xs"
        />

        {/* Preview */}
        {preview && (
          <div
            className={
              "rounded-xl border px-3 py-2.5 text-sm " +
              (preview.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400")
            }
          >
            {preview.ok && summary ? (
              <span>
                ✓ <strong>{summary.title}</strong> · 노드 {summary.nodeCount}개 ·
                엣지 {summary.edgeCount}개
              </span>
            ) : (
              <span>✕ {!preview.ok && preview.error}</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
