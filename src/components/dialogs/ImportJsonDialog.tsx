"use client";

import { FileUp, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { parseOutlineToTree } from "@/lib/outlineImport";
import {
  MAX_IMPORT_BYTES,
  parseImportJson,
  summarizeDocument,
} from "@/lib/validation";
import { useMindMapStore } from "@/store/mindMapStore";

const OUTLINE_PLACEHOLDER = `# 중심 주제
## 첫 번째 가지
- 세부 항목 1
- 세부 항목 2
## 두 번째 가지
  들여쓰기로 하위 항목도 가능`;

export function ImportJsonDialog({
  onImported,
}: { onImported?: () => void } = {}) {
  const open = useMindMapStore((s) => s.dialog === "import");
  const tab = useMindMapStore((s) => s.importTab);
  const setTab = useMindMapStore((s) => s.setImportTab);
  const setDialog = useMindMapStore((s) => s.setDialog);
  const importJson = useMindMapStore((s) => s.importJson);
  const importOutline = useMindMapStore((s) => s.importOutline);
  const saveWorkspace = useMindMapStore((s) => s.saveWorkspace);

  const [jsonText, setJsonText] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [fileError, setFileError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<FileReader | null>(null);
  const readIdRef = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  const cancelFileRead = useCallback(() => {
    readIdRef.current += 1;
    const reader = readerRef.current;
    readerRef.current = null;
    reader?.abort();
  }, []);

  useEffect(() => {
    // A different dialog can close this one without calling close(). A late
    // file callback must never repopulate a later import session.
    cancelFileRead();
    setReadingFile(false);
    setJsonText("");
    setOutlineText("");
    setFileError("");
    if (fileRef.current) fileRef.current.value = "";
    return cancelFileRead;
  }, [open, cancelFileRead]);

  useEffect(() => {
    cancelFileRead();
    setReadingFile(false);
    setFileError("");
  }, [tab, cancelFileRead]);

  const close = () => {
    cancelFileRead();
    setReadingFile(false);
    setDialog(null);
    setJsonText("");
    setOutlineText("");
    setFileError("");
  };

  // JSON preview
  const jsonPreview = useMemo(
    () => (jsonText.trim() ? parseImportJson(jsonText) : null),
    [jsonText],
  );
  const jsonSummary =
    jsonPreview && jsonPreview.ok
      ? summarizeDocument(jsonPreview.document)
      : null;

  // Outline preview
  const outlineTree = useMemo(
    () => (outlineText.trim() ? parseOutlineToTree(outlineText) : null),
    [outlineText],
  );

  const handleFile = (file: File) => {
    cancelFileRead();
    setReadingFile(false);
    setFileError("");
    if (tab === "json") setJsonText("");
    else setOutlineText("");
    const limit = tab === "json" ? MAX_IMPORT_BYTES : 10 * 1024 * 1024;
    if (file.size > limit) {
      setFileError(
        tab === "json"
          ? "32MB 이하 JSON 파일을 선택하세요."
          : "10MB 이하 파일을 선택하세요.",
      );
      return;
    }
    const reader = new FileReader();
    readerRef.current = reader;
    const readId = readIdRef.current;
    const targetTab = tab;
    const currentRead = () =>
      openRef.current &&
      readIdRef.current === readId &&
      readerRef.current === reader;
    setReadingFile(true);
    reader.onload = () => {
      if (!currentRead()) return;
      readerRef.current = null;
      setReadingFile(false);
      const text = String(reader.result ?? "").replace(/^\uFEFF/, "");
      if (targetTab === "json") setJsonText(text);
      else setOutlineText(text);
    };
    reader.onerror = () => {
      if (!currentRead()) return;
      readerRef.current = null;
      setReadingFile(false);
      setFileError("파일을 읽지 못했습니다. 다시 선택하세요.");
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (
      !canImport ||
      readingFile ||
      useMindMapStore.getState().dialog !== "import"
    ) return;
    // Follow the editor's existing blur-to-commit rule before replacing its
    // active document. Cancel and invalid input never switch documents.
    (document.activeElement as HTMLElement | null)?.blur();
    const imported =
      tab === "json" ? importJson(jsonText) : importOutline(outlineText);
    if (imported) {
      saveWorkspace();
      close();
      onImported?.();
    }
  };

  const canImport = tab === "json" ? !!jsonPreview?.ok : !!outlineTree;

  return (
    <Modal
      open={open}
      onClose={close}
      title="가져오기"
      description="기존 문서를 덮어쓰지 않고 새 문서로 엽니다. JSON은 내용·디자인·손그림을 함께 복원합니다."
      footer={
        <>
          <Button onClick={close}>취소</Button>
          <Button
            variant="primary"
            disabled={!canImport || readingFile}
            onClick={handleImport}
          >
            <Upload size={15} /> 가져오기
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-xl border border-line bg-surface-base p-1">
        {(
          [
            { id: "json", label: "JSON" },
            { id: "outline", label: "텍스트 / 아웃라인" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setFileError("");
            }}
            aria-pressed={tab === t.id}
            className={cn(
              "min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === t.id
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={
          tab === "json"
            ? "application/json,.json"
            : "text/plain,text/markdown,.txt,.md,.markdown"
        }
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {fileError && (
        <p role="alert" className="mb-3 text-sm text-red-500">
          {fileError}
        </p>
      )}
      {readingFile && (
        <p role="status" className="mb-3 text-sm text-ink-soft">
          파일을 읽는 중…
        </p>
      )}

      {tab === "json" ? (
        <div className="space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-base py-6 text-sm text-ink-soft transition hover:border-brand/50 hover:text-ink"
          >
            <FileUp size={18} /> JSON 파일 선택
          </button>
          <Textarea
            aria-label="JSON 내용"
            value={jsonText}
            onChange={(e) => {
              cancelFileRead();
              setReadingFile(false);
              setFileError("");
              setJsonText(e.target.value);
            }}
            placeholder='{ "document": { ... } }'
            className="min-h-[160px] font-mono text-xs"
          />
          {jsonPreview && (
            <div
              role={jsonPreview.ok ? "status" : "alert"}
              className={
                "rounded-xl border px-3 py-2.5 text-sm " +
                (jsonPreview.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400")
              }
            >
              {jsonPreview.ok && jsonSummary ? (
                <span>
                  ✓ <strong>{jsonSummary.title}</strong> · 노드{" "}
                  {jsonSummary.nodeCount}개
                </span>
              ) : (
                <span>✕ {!jsonPreview.ok && jsonPreview.error}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => fileRef.current?.click()}>
            <FileUp size={17} /> Markdown / 텍스트 파일 선택
          </Button>
          <p className="text-xs leading-relaxed text-ink-soft">
            마크다운 제목(#, ##), 글머리표(-, *), 또는 들여쓰기(공백·탭)로
            계층을 표현하면 자동으로 가지로 변환됩니다. [ ]와 [x]는 할 일과 완료
            상태를 유지합니다.
          </p>
          <Textarea
            aria-label="아웃라인 내용"
            value={outlineText}
            onChange={(e) => {
              cancelFileRead();
              setReadingFile(false);
              setFileError("");
              setOutlineText(e.target.value);
            }}
            placeholder={OUTLINE_PLACEHOLDER}
            className="min-h-[180px] font-mono text-xs"
          />
          {outlineText.trim() && (
            <div
              className={
                "rounded-xl border px-3 py-2.5 text-sm " +
                (outlineTree
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400")
              }
            >
              {outlineTree ? (
                <span>
                  ✓ <strong>{outlineTree.title}</strong> · 노드{" "}
                  {outlineTree.nodes.length}개로 변환됩니다
                </span>
              ) : (
                <span>✕ 변환할 내용이 없습니다</span>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
