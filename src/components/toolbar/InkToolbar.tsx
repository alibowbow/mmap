"use client";

import {
  Eraser,
  Hand,
  MousePointer2,
  PenLine,
  SlidersHorizontal,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Scan,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useMindMapStore } from "@/store/mindMapStore";
import { cn } from "@/lib/cn";
import type { InkTool } from "@/types/mindmap";

const tools: { id: InkTool; label: string; icon: typeof Hand }[] = [
  { id: "node", label: "노드", icon: MousePointer2 },
  { id: "pen", label: "그리기", icon: PenLine },
  { id: "eraser", label: "지우개", icon: Eraser },
  { id: "pan", label: "이동", icon: Hand },
];
const colors = [
  "#2563eb",
  "#0f172a",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#f97316",
];
export function InkToolbar() {
  const tool = useMindMapStore((s) => s.inkTool);
  const boardMode = useMindMapStore((s) => s.boardMode);
  const settings = useMindMapStore((s) => s.inkSettings);
  const strokes = useMindMapStore((s) => s.ink.strokes.length);
  const busy = useMindMapStore((s) => s.inkGestureActive);
  const setTool = useMindMapStore((s) => s.setInkTool);
  const setSettings = useMindMapStore((s) => s.setInkSettings);
  const [options, setOptions] = useState(false);
  const [clear, setClear] = useState(false);
  const doc = useMindMapStore((s) => s.activeDocumentId);
  useEffect(() => {
    setOptions(false);
    setClear(false);
  }, [doc]);
  const drawing = tool !== "node";
  const button =
    "flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold transition-colors disabled:opacity-40";
  const camera = (delta: number) => {
    const s = useMindMapStore.getState();
    s.noteCameraIntent();
    if (delta > 0) void s.flow?.zoomIn();
    else void s.flow?.zoomOut();
  };
  return (
    <>
      <div
        data-ink-modebar
        className="absolute left-1/2 top-2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-line bg-surface-raised/95 p-1 shadow-soft backdrop-blur-md"
        role="toolbar"
        aria-label="편집 모드"
      >
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={label + " 모드"}
            aria-pressed={tool === id}
            disabled={busy}
            onClick={() => setTool(id)}
            className={cn(
              button,
              tool === id
                ? "bg-brand text-brand-contrast"
                : "text-ink-soft hover:bg-surface-sunken",
            )}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {drawing && (
        <div
          data-ink-toolbar
          style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          className="absolute bottom-3 left-1/2 z-30 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-2xl border border-line bg-surface-raised/95 p-1 shadow-float backdrop-blur-md"
        >
          <p
            className="px-2 pb-1 pt-1 text-center text-[11px] text-ink-soft"
            aria-live="polite"
          >
            {tool === "pen"
              ? "펜·손가락으로 그리기 · 두 손가락으로 이동"
              : tool === "eraser"
                ? "닿은 획 전체 지우기 · 노드는 유지"
                : "한 손가락으로 이동 · 두 손가락으로 확대"}
          </p>
          <div
            className="flex items-center gap-0.5"
            role="toolbar"
            aria-label="손그림 도구"
          >
            <button
              className={cn(button, "text-ink")}
              disabled={busy}
              aria-label="펜 색과 굵기"
              onClick={() => setOptions(true)}
            >
              <span
                className="h-4 w-4 rounded-full border border-line"
                style={{ background: settings.color }}
              />
              <span>{settings.width}px</span>
              <SlidersHorizontal size={15} />
            </button>
            <button
              className={cn(button, "text-ink-soft")}
              disabled={busy}
              aria-label="축소"
              onClick={() => camera(-1)}
            >
              <ZoomOut size={19} />
            </button>
            <button
              className={cn(button, "text-ink-soft")}
              disabled={busy}
              aria-label="확대"
              onClick={() => camera(1)}
            >
              <ZoomIn size={19} />
            </button>
            <button
              className={cn(button, "text-ink-soft")}
              disabled={busy}
              aria-label="노드와 잉크 화면 맞춤"
              onClick={() => useMindMapStore.getState().fitToView()}
            >
              <Scan size={19} />
            </button>
            <button
              className={cn(button, "text-ink-soft")}
              disabled={busy || !strokes}
              aria-label="잉크 전체 지우기"
              onClick={() => setClear(true)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}
      {boardMode === "blank" && !strokes && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-ink-faint">
          <p>
            가지도, 글씨도 자유롭게 그려보세요.
            <br />
            <span className="text-xs">
              화면을 옮길 때는 ‘이동’을 선택하세요.
            </span>
          </p>
        </div>
      )}
      <Modal
        open={options}
        onClose={() => setOptions(false)}
        title="펜 색과 굵기"
        className="max-w-sm"
      >
        <div className="flex flex-wrap gap-2" aria-label="펜 색상">
          {colors.map((color) => (
            <button
              key={color}
              aria-label={"펜 색 " + color}
              aria-pressed={settings.color === color}
              onClick={() => setSettings({ color })}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line"
            >
              <span
                className={cn(
                  "h-7 w-7 rounded-full",
                  settings.color === color && "ring-2 ring-brand ring-offset-2",
                )}
                style={{ background: color }}
              />
            </button>
          ))}
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-ink">
          직접 선택
          <input
            aria-label="직접 펜 색 선택"
            type="color"
            value={settings.color}
            onChange={(e) => setSettings({ color: e.target.value })}
            className="h-11 w-14"
          />
        </label>
        <label className="mt-3 block text-sm text-ink">
          펜 굵기 · {settings.width}px
          <input
            aria-label="펜 굵기"
            type="range"
            min="1"
            max="32"
            step="1"
            value={settings.width}
            onChange={(e) => setSettings({ width: Number(e.target.value) })}
            className="block h-11 w-full accent-brand"
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          펜이 필압을 제공하면 굵기에 반영합니다. 필압 미지원 입력은 일정한
          굵기로 그립니다. S Pen 필압·팜리젝션은 실기기에서 확인하지 않았습니다.
        </p>
        <button
          onClick={() => setOptions(false)}
          className={cn(button, "mt-4 w-full bg-brand text-brand-contrast")}
        >
          <X size={16} />
          완료
        </button>
      </Modal>
      <Modal
        open={clear}
        onClose={() => setClear(false)}
        title="잉크를 모두 지울까요?"
        description="이 문서의 손그림 획만 지웁니다. 노드는 유지되며 실행 취소로 복원할 수 있습니다."
        className="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <button
            className={cn(button, "text-ink-soft")}
            onClick={() => setClear(false)}
          >
            취소
          </button>
          <button
            className={cn(button, "bg-red-600 text-white")}
            onClick={() => {
              useMindMapStore.getState().clearInk();
              setClear(false);
            }}
          >
            잉크만 지우기
          </button>
        </div>
      </Modal>
    </>
  );
}
