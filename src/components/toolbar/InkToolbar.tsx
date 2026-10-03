"use client";
import {
  Eraser,
  Hand,
  MousePointer2,
  PenLine,
  Scan,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  SlidersHorizontal,
  Trash2,
  Move,
  RotateCcw,
  RotateCw,
  Layers,
  ArrowDownToLine,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useMindMapStore } from "@/store/mindMapStore";
import { cn } from "@/lib/cn";
import { AnalogMark } from "@/components/canvas/AnalogMark";
import {
  BRUSHES,
  BRUSH_NAMES,
  BRUSH_WIDTH,
  PALETTES,
  STAMPS,
  DEFAULT_PAPER,
  inkItems,
  isStroke,
  identityTransform,
} from "@/lib/ink";
import { studioDocument } from "@/lib/studioExamples";
import { exportDocumentJson } from "@/lib/export";
import type { InkTool } from "@/types/mindmap";
const modes: { id: InkTool; label: string; icon: typeof Hand }[] = [
  { id: "node", label: "노드", icon: MousePointer2 },
  { id: "pen", label: "그리기", icon: PenLine },
  { id: "select", label: "선택", icon: Move },
  { id: "eraser", label: "지우개", icon: Eraser },
  { id: "pan", label: "이동", icon: Hand },
];
const shapeNames = {
  circle: "원",
  box: "상자",
  arrow: "화살표",
  star: "별",
  leaf: "잎",
  bulb: "전구",
  heart: "하트",
  book: "책",
  sun: "해",
  cloud: "구름",
};
export function InkToolbar() {
  const tool = useMindMapStore((s) => s.inkTool),
    ink = useMindMapStore((s) => s.ink),
    settings = useMindMapStore((s) => s.inkSettings);
  const busy = useMindMapStore((s) => s.inkGestureActive),
    board = useMindMapStore((s) => s.boardMode),
    selectedId = useMindMapStore((s) => s.selectedInkId);
  const selected = inkItems(ink).find((s) => s.id === selectedId);
  const setTool = useMindMapStore((s) => s.setInkTool),
    setSettings = useMindMapStore((s) => s.setInkSettings);
  const undo = useMindMapStore((s) => s.history.length > 0),
    redo = useMindMapStore((s) => s.future.length > 0);
  const [options, setOptions] = useState(false),
    [clear, setClear] = useState(false),
    [panel, setPanel] = useState("도구"),
    [palette, setPalette] = useState<keyof typeof PALETTES>("정원");
  const doc = useMindMapStore((s) => s.activeDocumentId);
  useEffect(() => {
    setOptions(false);
    setClear(false);
  }, [doc]);
  const drawing = tool !== "node",
    brush = settings.brush ?? "pen",
    paper = ink.paper ?? { ...DEFAULT_PAPER, kind: "none" as const };
  const btn =
    "flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold disabled:opacity-30 hover:bg-surface-sunken";
  const chooseColor = (color: string) =>
    setSettings({
      color,
      recentColors: [
        color,
        ...(settings.recentColors ?? []).filter((c) => c !== color),
      ].slice(0, 8),
    });
  const transform = (scale: number, rotate: number) => {
    if (!selected) return;
    const t = selected.transform ?? identityTransform();
    useMindMapStore.getState().updateInkItem(selected.id, {
      transform: {
        ...t,
        scale: Math.min(10, Math.max(0.1, t.scale * scale)),
        rotation: t.rotation + rotate,
      },
    });
  };
  const modebar = (
    <div
      data-ink-modebar
      role="toolbar"
      aria-label="편집 모드"
      className="flex justify-center gap-0.5 p-1"
    >
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          aria-label={label + " 모드"}
          aria-pressed={
            tool === id ||
            (id === "pen" && (tool === "stamp" || tool === "label"))
          }
          disabled={busy}
          onClick={() => setTool(id)}
          className={cn(
            btn,
            "flex-col gap-0.5 px-2",
            tool === id
              ? "bg-brand text-brand-contrast hover:bg-brand"
              : "text-ink-soft",
          )}
        >
          <Icon size={17} />
          <span className="text-[10px]">{label}</span>
        </button>
      ))}
    </div>
  );
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (n: number) => void,
  ) => (
    <label className="block text-xs text-ink-soft">
      {label} · {Math.round(value * 100) / 100}
      <input
        className="block h-11 w-full accent-brand"
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  const swatches = (colors: readonly string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          aria-label={"펜 색 " + color}
          aria-pressed={settings.color === color}
          className={cn(btn, settings.color === color && "ring-2 ring-brand")}
          onClick={() => chooseColor(color)}
        >
          <span
            className="h-7 w-7 rounded-full border border-black/10"
            style={{ background: color }}
          />
        </button>
      ))}
    </div>
  );
  return (
    <>
      {!drawing && (
        <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-2xl border border-line bg-surface-raised/95 shadow-soft">
          {modebar}
        </div>
      )}
      {drawing && (
        <div
          data-ink-toolbar
          style={{ bottom: "calc(.75rem + env(safe-area-inset-bottom))" }}
          className="absolute left-1/2 z-30 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-2xl border border-line bg-surface-raised/95 p-1 shadow-float backdrop-blur-md"
        >
          {selected && tool === "select" && (
            <div
              className="flex justify-center border-b border-line pb-1"
              role="toolbar"
              aria-label="선택 항목 변환"
            >
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 작게"
                onClick={() => transform(1 / 1.15, 0)}
              >
                <ZoomOut size={17} />
              </button>
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 크게"
                onClick={() => transform(1.15, 0)}
              >
                <ZoomIn size={17} />
              </button>
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 왼쪽 회전"
                onClick={() => transform(1, -15)}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 오른쪽 회전"
                onClick={() => transform(1, 15)}
              >
                <RotateCw size={17} />
              </button>
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 맨 앞으로"
                onClick={() =>
                  useMindMapStore.getState().reorderInk(selected.id, true)
                }
              >
                <Layers size={17} />
              </button>
              <button
                className={btn}
                disabled={busy}
                aria-label="선택 항목 삭제"
                onClick={() =>
                  useMindMapStore.getState().eraseInkStrokes([selected.id])
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          )}
          {modebar}
          <div
            className="flex justify-center gap-0.5 border-t border-line pt-1"
            role="toolbar"
            aria-label="손그림 도구"
          >
            <button
              className={cn(btn, "flex-col w-16 px-0 text-ink")}
              disabled={busy}
              aria-label="아날로그 도구함"
              onClick={() => setOptions(true)}
            >
              <span className="flex gap-1">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: settings.color }}
                />
                <SlidersHorizontal size={14} />
              </span>
              <span className="text-[10px]">
                {tool === "stamp"
                  ? "그림"
                  : tool === "label"
                    ? "글씨"
                    : BRUSH_NAMES[brush]}{" "}
                {settings.width}px
              </span>
            </button>
            <button
              className={btn}
              disabled={busy || !undo}
              aria-label="손그림 실행 취소"
              onClick={() => useMindMapStore.getState().undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              className={btn}
              disabled={busy || !redo}
              aria-label="손그림 다시 실행"
              onClick={() => useMindMapStore.getState().redo()}
            >
              <Redo2 size={17} />
            </button>
            <button
              className={btn}
              disabled={busy}
              aria-label="축소"
              onClick={() => {
                const s = useMindMapStore.getState();
                s.noteCameraIntent();
                void s.flow?.zoomOut();
              }}
            >
              <ZoomOut size={17} />
            </button>
            <button
              className={btn}
              disabled={busy}
              aria-label="확대"
              onClick={() => {
                const s = useMindMapStore.getState();
                s.noteCameraIntent();
                void s.flow?.zoomIn();
              }}
            >
              <ZoomIn size={17} />
            </button>
            <button
              className={btn}
              disabled={busy}
              aria-label="노드와 잉크 화면 맞춤"
              onClick={() => useMindMapStore.getState().fitToView()}
            >
              <Scan size={17} />
            </button>
          </div>
          <p
            className="px-1 pt-1 text-center text-[10px] text-ink-soft"
            aria-live="polite"
          >
            {tool === "select"
              ? "획·그림을 탭하고 끌기 · 도구함에서 옵션"
              : tool === "eraser"
                ? "닿은 획·그림 지우기 · 노드는 유지"
                : tool === "pan"
                  ? "한 손가락 이동 · 두 손가락 확대"
                  : tool === "label"
                    ? "도구함에서 글씨 입력 → 화면 탭"
                    : tool === "stamp"
                      ? "탭해서 그림 · 끌어서 크기 정하기"
                      : brush === "branch"
                        ? "시작에서 끝으로 끌기 · 두 손가락 이동"
                        : "자유 필기 · 펜/손가락 그리기 · 두 손가락 이동"}
          </p>
        </div>
      )}
      {board === "blank" && !inkItems(ink).length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-ink-faint">
          <p>
            아날로그 모드 · 빈 종이에 자유롭게 그려보세요.
            <br />
            <span className="text-xs">
              가지·손글씨·채색 그림을 직접 · 보조 도구는 선택 사항
            </span>
          </p>
        </div>
      )}
      <Modal
        open={options}
        onClose={() => setOptions(false)}
        title="아날로그 도구함"
        className="max-w-md"
      >
        <div
          className="mb-3 flex flex-wrap gap-1"
          role="tablist"
          aria-label="도구함 섹션"
        >
          {["도구", "색", "그림/글씨", "종이", "예제"].map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={panel === p}
              onClick={() => setPanel(p)}
              className={cn(
                btn,
                "px-2",
                panel === p && "bg-brand text-brand-contrast",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        {panel === "도구" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {BRUSHES.map((b) => (
                <button
                  key={b}
                  aria-label={BRUSH_NAMES[b] + " 도구"}
                  aria-pressed={brush === b && tool === "pen"}
                  onClick={() => {
                    setTool("pen");
                    setSettings({ brush: b, width: BRUSH_WIDTH[b] });
                  }}
                  className={cn(
                    "min-h-20 rounded-xl border border-line p-2 text-xs",
                    brush === b && "ring-2 ring-brand",
                  )}
                >
                  <svg viewBox="0 0 100 35" className="h-8 w-full">
                    <AnalogMark
                      item={{
                        id: "sample-" + b,
                        brush: b,
                        color: settings.color,
                        width: b === "branch" ? 15 : BRUSH_WIDTH[b] * 0.65,
                        seed: 7,
                        points: Array.from({ length: 30 }, (_, i) => ({
                          x: 10 + i * 2.6,
                          y: 18 + Math.sin(i / 7) * 6,
                          pressure: 1,
                        })),
                      }}
                    />
                  </svg>
                  {BRUSH_NAMES[b]}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-1">
              {range("펜 굵기", settings.width, 1, 64, 1, (width) =>
                setSettings({ width }),
              )}
              {range(
                "불투명도",
                settings.opacity ?? 1,
                0.1,
                1,
                0.05,
                (opacity) => setSettings({ opacity }),
              )}
              {brush === "pencil" &&
                range(
                  "색연필 결",
                  settings.texture ?? 0.7,
                  0,
                  1,
                  0.05,
                  (texture) => setSettings({ texture }),
                )}
              {(brush === "brush" || brush === "branch") &&
                range("가늘어짐", settings.taper ?? 0.8, 0, 1, 0.05, (taper) =>
                  setSettings({ taper }),
                )}
              {brush === "branch" &&
                range(
                  "가지 곡선",
                  settings.curve ?? 0.25,
                  -1,
                  1,
                  0.05,
                  (curve) => setSettings({ curve }),
                )}
            </div>
            <p className="text-xs text-ink-soft">
              필압이 있으면 반영합니다. 브러시·가지는 필압 없이도 자연스러운
              굵기를 만듭니다.
            </p>
          </>
        )}
        {panel === "색" && (
          <>
            <div className="mb-3 flex gap-1">
              {Object.keys(PALETTES).map((p) => (
                <button
                  key={p}
                  className={cn(
                    btn,
                    palette === p && "bg-brand text-brand-contrast",
                  )}
                  onClick={() => setPalette(p as keyof typeof PALETTES)}
                >
                  {p}
                </button>
              ))}
            </div>
            {swatches(PALETTES[palette])}
            <p className="mb-1 mt-3 text-xs text-ink-soft">기본 색</p>
            {swatches([
              "#2563eb",
              "#0f172a",
              "#dc2626",
              "#16a34a",
              "#9333ea",
              "#f4c343",
            ])}
            <p className="mb-1 mt-3 text-xs text-ink-soft">최근 색</p>
            {swatches(settings.recentColors ?? [])}
            <label className="mt-3 flex h-11 items-center gap-3 text-sm">
              직접 선택
              <input
                aria-label="직접 펜 색 선택"
                type="color"
                value={settings.color}
                onChange={(e) => chooseColor(e.target.value)}
                className="h-11 w-14"
              />
            </label>
          </>
        )}
        {panel === "그림/글씨" && (
          <>
            <div className="grid grid-cols-5 gap-1">
              {STAMPS.map((shape) => (
                <button
                  key={shape}
                  aria-label={shapeNames[shape] + " 그림"}
                  className={cn(
                    "flex min-h-16 flex-col items-center rounded-xl p-1 text-[10px]",
                    tool === "stamp" &&
                      settings.shape === shape &&
                      "bg-brand/10 ring-1 ring-brand",
                  )}
                  onClick={() => {
                    setTool("stamp");
                    setSettings({ shape });
                  }}
                >
                  <svg viewBox="0 0 100 100" className="h-8 w-8">
                    <AnalogMark
                      item={{
                        id: "s" + shape,
                        kind: "stamp",
                        shape,
                        x: 50,
                        y: 50,
                        width: 90,
                        height: 90,
                        color: settings.color,
                        fill: false,
                        fontSize: 28,
                      }}
                    />
                  </svg>
                  {shapeNames[shape]}
                </button>
              ))}
            </div>
            <label className="my-3 flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.fill ?? false}
                onChange={(e) => setSettings({ fill: e.target.checked })}
                className="h-5 w-5"
              />
              그림 색 채우기
            </label>
            <input
              aria-label="핵심어 라벨"
              className="h-11 w-full rounded-xl border border-line bg-surface-sunken px-3 text-sm"
              value={settings.text ?? "핵심어"}
              maxLength={40}
              onChange={(e) => setSettings({ text: e.target.value })}
            />
            {range("글씨 크기", settings.fontSize ?? 28, 8, 96, 1, (fontSize) =>
              setSettings({ fontSize }),
            )}
            <button
              className={cn(btn, "w-full bg-brand text-brand-contrast")}
              onClick={() => {
                setTool("label");
                setOptions(false);
              }}
            >
              이 글씨를 화면에 놓기
            </button>
          </>
        )}
        {panel === "종이" && (
          <>
            <div className="flex gap-1">
              {(["none", "white", "cream", "kraft"] as const).map((kind, i) => (
                <button
                  key={kind}
                  className={cn(
                    btn,
                    paper.kind === kind && "bg-brand text-brand-contrast",
                  )}
                  onClick={() =>
                    useMindMapStore.getState().setInkPaper({ ...paper, kind })
                  }
                >
                  {["기존", "백지", "크림", "크라프트"][i]}
                </button>
              ))}
            </div>
            {range("종이 결", paper.texture, 0, 1, 0.05, (texture) =>
              useMindMapStore.getState().setInkPaper({ ...paper, texture }),
            )}
            <p className="text-xs text-ink-soft">
              종이와 결은 이 문서의 이미지 출력·JSON·실행 취소에도 남습니다.
            </p>
          </>
        )}
        {panel === "예제" && (
          <div className="space-y-2">
            {(["map", "swatches"] as const).map((k) => (
              <button
                key={k}
                className={cn(btn, "w-full border border-line")}
                onClick={() => {
                  useMindMapStore
                    .getState()
                    .importJson(exportDocumentJson(studioDocument(k)));
                  setOptions(false);
                }}
              >
                새 문서로{" "}
                {k === "map" ? "생각의 정원 열기" : "도구 자국 비교 열기"}
              </button>
            ))}
            <p className="text-xs text-ink-soft">
              기존 문서는 그대로 보존하며 새 예제를 엽니다.
            </p>
          </div>
        )}
        {selected && (
          <div className="mt-4 border-t border-line pt-3">
            <button
              className={cn(btn, "w-full border border-line")}
              onClick={() => {
                const patch = isStroke(selected)
                  ? {
                      color: settings.color,
                      width: settings.width,
                      brush,
                      opacity: settings.opacity ?? 1,
                      texture: settings.texture ?? 0.7,
                      taper: settings.taper ?? 0.8,
                      curve: settings.curve ?? 0.25,
                    }
                  : selected.kind === "label"
                    ? {
                        color: settings.color,
                        text: settings.text || selected.text,
                        fontSize: settings.fontSize ?? selected.fontSize,
                        width: Math.max(
                          20,
                          [...(settings.text || selected.text || "")].reduce(
                            (n, c) => n + (/[^\x00-\x7F]/.test(c) ? 1 : 0.6),
                            0,
                          ) * (settings.fontSize ?? selected.fontSize),
                        ),
                        height: (settings.fontSize ?? selected.fontSize) * 1.5,
                      }
                    : { color: settings.color, fill: settings.fill ?? false };
                useMindMapStore.getState().updateInkItem(selected.id, patch);
              }}
            >
              선택 항목에 옵션 적용
            </button>
            <button
              className={cn(btn, "w-full")}
              onClick={() =>
                useMindMapStore.getState().reorderInk(selected.id, false)
              }
            >
              <ArrowDownToLine size={16} />맨 뒤로 보내기
            </button>
          </div>
        )}
        <div className="mt-4 flex gap-2 border-t border-line pt-3">
          <button
            className={cn(btn, "flex-1 text-red-600")}
            disabled={!inkItems(ink).length}
            aria-label="잉크 전체 지우기"
            onClick={() => {
              setOptions(false);
              setClear(true);
            }}
          >
            <Trash2 size={17} />
            전체 지우기
          </button>
          <button
            className={cn(btn, "flex-1 bg-brand text-brand-contrast")}
            onClick={() => setOptions(false)}
          >
            완료
          </button>
        </div>
      </Modal>
      <Modal
        open={clear}
        onClose={() => setClear(false)}
        title="잉크를 모두 지울까요?"
        description="획·그림·라벨만 지웁니다. 노드와 종이는 유지하며 실행 취소로 복원합니다."
        className="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={() => setClear(false)}>
            취소
          </button>
          <button
            className={cn(btn, "bg-red-600 text-white")}
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
