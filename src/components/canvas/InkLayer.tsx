"use client";

import { ViewportPortal, useReactFlow } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  inkBounds,
  appendInkPoint,
  itemHit,
  inkItems,
  itemBounds,
  identityTransform,
  hashSeed,
  isStroke,
  MAX_STROKE_POINTS,
} from "@/lib/ink";
import {
  appendStrokeErasure,
  selectInkInPolygon,
  strokeVisibleHit,
  translateInkItems,
} from "@/lib/inkEditing";
import {
  findBranchJunction,
  snapBranchStart,
  type InkJunction,
} from "@/lib/inkJunction";
import { strokeEditHandles, deformStrokeAt } from "@/lib/inkCurveEditing";
import { createId } from "@/lib/id";
import { useMindMapStore } from "@/store/mindMapStore";
import { AnalogMark } from "./AnalogMark";
import type { InkItem } from "@/lib/ink";
import type {
  InkObject,
  InkPoint,
  InkStroke,
  MindMapViewport,
} from "@/types/mindmap";

type Contact = { x: number; y: number; type: string };
type Gesture = {
  kind: "pen" | "eraser" | "select" | "lasso" | "reshape" | "stamp" | "label";
  items: InkItem[];
  selectedIds: string[];
  path: InkPoint[];
  replacements: Map<string, InkItem>;
  fraction?: number;
  junction?: InkJunction;
  partial?: boolean;
  item?: InkItem;
  start: InkPoint;
  pointer: number;
  doc: string | null;
  stroke: InkStroke;
  removed: Set<string>;
  last: InkPoint;
  zoom: number;
};
type CameraGesture = {
  viewport: MindMapViewport;
  center: { x: number; y: number };
  distance: number;
};

export function InkLayer() {
  const ink = useMindMapStore((s) => s.ink);
  const tool = useMindMapStore((s) => s.inkTool);
  const doc = useMindMapStore((s) => s.activeDocumentId);
  const presentation = useMindMapStore((s) => s.presentationMode);
  const flow = useReactFlow();
  const bounds = useMemo(() => inkBounds(ink), [ink]);
  const [previews, setPreviews] = useState<InkItem[]>([]);
  const [lassoPath, setLassoPath] = useState<InkPoint[]>([]);
  const [joinPreview, setJoinPreview] = useState<InkJunction | null>(null);
  const [live, setLive] = useState<InkItem | null>(null);
  const selectedId = useMindMapStore((s) => s.selectedInkId);
  const selectedIds = useMindMapStore((s) => s.selectedInkIds);
  const items = useMemo(() => inkItems(ink), [ink]);
  const selected = items.find((s) => s.id === selectedId);
  const eraser = useRef<SVGCircleElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const contacts = useRef(new Map<number, Contact>());
  const gesture = useRef<Gesture | null>(null);
  const camera = useRef<CameraGesture | null>(null);
  const frame = useRef(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const active = !presentation && tool !== "node";

  const reset = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    gesture.current = null;
    camera.current = null;
    contacts.current.clear();
    setLive(null);
    setPreviews([]);
    setLassoPath([]);
    setJoinPreview(null);
    if (eraser.current) eraser.current.style.display = "none";
    setHidden(new Set());
    useMindMapStore.setState({ inkGestureActive: false });
  }, []);
  useEffect(() => {
    reset();
    // A cancelled gesture never adds partial ink or deletes committed strokes.
    const cancel = () => reset();
    window.addEventListener("blur", cancel);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && contacts.current.size) {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", escape);
    const visibility = () => {
      if (document.visibilityState === "hidden") reset();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
      reset();
    };
  }, [doc, tool, presentation, reset]);

  const sample = (
    e: {
      clientX: number;
      clientY: number;
      pointerType: string;
      pressure: number;
    },
    last?: InkPoint,
  ): InkPoint => {
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return {
      x: p.x,
      y: p.y,
      pressure:
        e.pointerType === "pen" && e.pressure > 0
          ? e.pressure
          : (last?.pressure ?? 1),
    };
  };
  const contactGeometry = () => {
    const [a, b] = [...contacts.current.values()];
    return {
      center: b
        ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        : { x: a.x, y: a.y },
      distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
    };
  };
  const startCamera = () => {
    const geo = contactGeometry();
    camera.current = { ...geo, viewport: flow.getViewport() };
    useMindMapStore.getState().noteCameraIntent();
  };
  const partialItems = (g: Gesture) => {
    g.replacements.clear();
    for (const item of g.items) {
      if (!isStroke(item) || !g.removed.has(item.id)) continue;
      const next = appendStrokeErasure(item, g.path, 12 / g.zoom);
      if (next !== item) g.replacements.set(item.id, next);
    }
    return g.items.map((item) => g.replacements.get(item.id) ?? item);
  };
  const renderedStroke = (g: Gesture) =>
    g.junction ? snapBranchStart({ ...g.stroke }, g.junction) : { ...g.stroke };
  const renderPreview = () => {
    frame.current = 0;
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pen") setLive(renderedStroke(g));
    if (g.kind === "select") {
      const changed = translateInkItems(
        g.items,
        g.selectedIds,
        g.last.x - g.start.x,
        g.last.y - g.start.y,
      );
      setPreviews(changed.filter((item) => g.selectedIds.includes(item.id)));
      setHidden(new Set(g.selectedIds));
    }
    if (g.kind === "reshape" && g.item && isStroke(g.item)) {
      setLive(deformStrokeAt(g.item, g.fraction ?? 0.5, g.last));
      setHidden(new Set([g.item.id]));
    }
    if (g.kind === "lasso") setLassoPath([...g.path]);
    if ((g.kind === "stamp" || g.kind === "label") && g.item) setLive(g.item);
    if (g.kind === "eraser") {
      if (g.partial) {
        partialItems(g);
        setPreviews([...g.replacements.values()]);
        setHidden(new Set(g.replacements.keys()));
      } else setHidden(new Set(g.removed));
    }
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(renderPreview);
  };
  const eraseSegment = (g: Gesture, point: InkPoint) => {
    for (const item of g.items) {
      if (g.partial && !isStroke(item)) continue;
      if (
        isStroke(item)
          ? strokeVisibleHit(item, g.last, point, 12 / g.zoom)
          : itemHit(item, g.last, point, 12 / g.zoom)
      )
        g.removed.add(item.id);
    }
    appendInkPoint(g.path, point, g.zoom);
    g.last = point;
    if (eraser.current) {
      eraser.current.setAttribute("cx", String(point.x));
      eraser.current.setAttribute("cy", String(point.y));
      eraser.current.setAttribute("r", String(12 / g.zoom));
      eraser.current.style.display = "";
    }
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0 && e.button !== 5) return;
    if (
      gesture.current &&
      contacts.current.get(gesture.current.pointer)?.type === "pen" &&
      e.pointerType === "touch"
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    contacts.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });
    if (contacts.current.size > 1) {
      // A second finger becomes navigation, dropping the uncommitted preview.
      gesture.current = null;
      setLive(null);
      setPreviews([]);
      setLassoPath([]);
      setJoinPreview(null);
      setHidden(new Set());
      useMindMapStore.setState({ inkGestureActive: false });
      startCamera();
      return;
    }
    if (tool === "pan") {
      startCamera();
      return;
    }
    const state = useMindMapStore.getState();
    const point = sample(e);
    let kind: Gesture["kind"] =
      e.button === 5
        ? "eraser"
        : tool === "eraser"
          ? "eraser"
          : tool === "select"
            ? "select"
            : tool === "lasso"
              ? "lasso"
              : tool === "reshape"
                ? "reshape"
                : tool === "stamp"
                  ? "stamp"
                  : tool === "label"
                    ? "label"
                    : "pen";
    let item: InkItem | undefined;
    const all = inkItems(state.ink);
    let group = state.selectedInkIds.length
      ? state.selectedInkIds
      : state.selectedInkId
        ? [state.selectedInkId]
        : [];
    let fraction: number | undefined;
    const hit = () =>
      [...all]
        .reverse()
        .find((s) =>
          isStroke(s)
            ? strokeVisibleHit(s, point, point, 8 / flow.getZoom())
            : itemHit(s, point, point, 8 / flow.getZoom()),
        );
    if (kind === "select") {
      item = hit();
      if (!item) {
        state.selectInk(null);
        return;
      }
      if (e.shiftKey) {
        state.selectInkItems(
          group.includes(item.id)
            ? group.filter((id) => id !== item!.id)
            : [...group, item.id],
        );
        return;
      }
      if (!group.includes(item.id)) {
        state.selectInk(item.id);
        group = [item.id];
      }
    }
    if (kind === "reshape") {
      const chosen = all.find((s) => s.id === state.selectedInkId);
      const handle =
        chosen && isStroke(chosen)
          ? strokeEditHandles(chosen).find(
              (h) =>
                Math.hypot(h.point.x - point.x, h.point.y - point.y) *
                  flow.getZoom() <
                16,
            )
          : undefined;
      if (!handle || !chosen) {
        item = hit();
        if (item && isStroke(item)) {
          state.selectInk(item.id);
          if (!strokeEditHandles(item).length)
            state.addToast(
              item.erasures?.length
                ? "부분 지운 획은 곡선 다듬기를 지원하지 않습니다."
                : "브러시나 유기적 가지를 선택해 주세요.",
            );
        } else state.selectInk(null);
        return;
      }
      item = chosen;
      fraction = handle.fraction;
    }
    if (kind === "stamp" || kind === "label") {
      const fontSize = state.inkSettings.fontSize ?? 28,
        text = state.inkSettings.text?.trim() || "핵심어";
      item = {
        id: createId("art"),
        kind,
        x: point.x,
        y: point.y,
        width:
          kind === "stamp"
            ? 80
            : Math.max(
                20,
                [...text].reduce(
                  (n, c) => n + (/[^\x00-\x7F]/.test(c) ? 1 : 0.6),
                  0,
                ) * fontSize,
              ),
        height: kind === "stamp" ? 80 : fontSize * 1.5,
        fontSize,
        text,
        shape: state.inkSettings.shape ?? "leaf",
        color: state.inkSettings.color,
        fill: state.inkSettings.fill ?? false,
      };
    }
    if (
      kind === "label" &&
      item &&
      !isStroke(item) &&
      state.inkSettings.labelOnBranch
    ) {
      const branch = findBranchJunction(state.ink, point, 48 / flow.getZoom());
      if (branch) {
        let angle =
          (Math.atan2(branch.tangent.y, branch.tangent.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        angle = Math.max(-25, Math.min(25, angle));
        const a = (angle * Math.PI) / 180;
        item = {
          ...item,
          x: branch.point.x + Math.sin(a) * item.fontSize * 0.72,
          y: branch.point.y - Math.cos(a) * item.fontSize * 0.72,
          transform: { ...identityTransform(), rotation: angle },
        };
      }
    }
    const id = createId("ink");
    const connecting =
      kind === "pen" &&
      state.inkSettings.connectBranches &&
      !e.altKey &&
      (state.inkSettings.brush === "brush" ||
        state.inkSettings.brush === "branch");
    const junction = connecting
      ? (findBranchJunction(
          state.ink,
          point,
          16 / flow.getZoom(),
          state.inkSettings.color,
        ) ?? undefined)
      : undefined;
    setJoinPreview(junction ?? null);
    const g: Gesture = {
      kind,
      item,
      items: all,
      selectedIds: group,
      fraction,
      junction,
      partial: state.inkSettings.eraserMode === "partial",
      path: [point],
      replacements: new Map(),
      start: point,
      pointer: e.pointerId,
      doc: state.activeDocumentId,
      stroke: {
        id,
        color: state.inkSettings.color,
        width: state.inkSettings.width,
        brush: state.inkSettings.brush ?? "pen",
        seed: hashSeed(id),
        opacity: state.inkSettings.opacity ?? 1,
        texture: state.inkSettings.texture ?? 0.7,
        taper: state.inkSettings.taper ?? 0.8,
        branchStyle: junction ? "hand-v1" : state.inkSettings.branchStyle,
        materialStyle: state.inkSettings.materialStyle,
        curve: state.inkSettings.curve ?? 0.25,
        points: [point],
      },
      removed: new Set(),
      last: point,
      zoom: flow.getZoom(),
    };
    gesture.current = g;
    useMindMapStore.setState({ inkGestureActive: true });
    if (kind === "eraser") eraseSegment(g, point);
    schedule();
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!contacts.current.has(e.pointerId)) {
      const state = useMindMapStore.getState();
      if (
        tool === "pen" &&
        state.inkSettings.connectBranches &&
        !e.altKey &&
        (state.inkSettings.brush === "brush" ||
          state.inkSettings.brush === "branch")
      )
        setJoinPreview(
          findBranchJunction(
            state.ink,
            sample(e),
            16 / flow.getZoom(),
            state.inkSettings.color,
          ),
        );
      else setJoinPreview(null);
      return;
    }
    contacts.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });
    if (camera.current) {
      const start = camera.current,
        geo = contactGeometry(),
        rect = surface.current!.getBoundingClientRect();
      const zoom = Math.max(
        0.0001,
        Math.min(
          2.5,
          start.viewport.zoom *
            (start.distance && geo.distance
              ? geo.distance / start.distance
              : 1),
        ),
      );
      const wx =
          (start.center.x - rect.left - start.viewport.x) / start.viewport.zoom,
        wy =
          (start.center.y - rect.top - start.viewport.y) / start.viewport.zoom;
      void flow.setViewport({
        x: geo.center.x - rect.left - wx * zoom,
        y: geo.center.y - rect.top - wy * zoom,
        zoom,
      });
      return;
    }
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const point = sample(ev, g.last);
      if (g.kind === "pen") {
        if (g.stroke.brush === "branch") g.stroke.points = [g.start, point];
        else appendInkPoint(g.stroke.points, point, g.zoom);
      } else if (g.kind === "eraser") eraseSegment(g, point);
      else if (g.kind === "select" || g.kind === "reshape") g.last = point;
      else if (g.kind === "lasso") {
        appendInkPoint(g.path, point, g.zoom);
        g.last = point;
      } else if (g.kind === "stamp" && g.item) {
        if (Math.hypot(point.x - g.start.x, point.y - g.start.y) * g.zoom > 6)
          g.item = {
            ...(g.item as InkObject),
            width: Math.min(
              4000,
              Math.max(20, Math.abs(point.x - g.start.x) * 2),
            ),
            height: Math.min(
              4000,
              Math.max(20, Math.abs(point.y - g.start.y) * 2),
            ),
          };
      }
    }
    schedule();
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!contacts.current.has(e.pointerId)) return;
    const g = gesture.current;
    if (
      g?.pointer === e.pointerId &&
      g.doc === useMindMapStore.getState().activeDocumentId
    ) {
      const point = sample(e, g.stroke.points.at(-1));
      if (g.kind === "pen") {
        if (g.stroke.brush === "branch") g.stroke.points = [g.start, point];
        else appendInkPoint(g.stroke.points, point, g.zoom, true);
        useMindMapStore.getState().addInkStroke(renderedStroke(g));
        if (g.stroke.points.length === MAX_STROKE_POINTS)
          useMindMapStore
            .getState()
            .addToast("긴 획을 마쳤습니다. 다음 획으로 이어 그려주세요.");
      } else if (g.kind === "eraser") {
        eraseSegment(g, point);
        if (g.partial)
          useMindMapStore.getState().replaceInkItems(partialItems(g));
        else useMindMapStore.getState().eraseInkStrokes([...g.removed]);
      } else if (g.kind === "select") {
        if (Math.hypot(point.x - g.start.x, point.y - g.start.y) * g.zoom > 1)
          useMindMapStore
            .getState()
            .replaceInkItems(
              translateInkItems(
                g.items,
                g.selectedIds,
                point.x - g.start.x,
                point.y - g.start.y,
              ),
            );
      } else if (g.kind === "reshape" && g.item && isStroke(g.item)) {
        const changed = deformStrokeAt(g.item, g.fraction ?? 0.5, point);
        if (changed !== g.item)
          useMindMapStore
            .getState()
            .replaceInkItems(
              g.items.map((s) => (s.id === changed.id ? changed : s)),
            );
      } else if (g.kind === "lasso") {
        appendInkPoint(g.path, point, g.zoom, true);
        const ids = selectInkInPolygon(g.items, g.path);
        useMindMapStore
          .getState()
          .selectInkItems(e.shiftKey ? [...g.selectedIds, ...ids] : ids);
      } else if (g.item && !isStroke(g.item)) {
        useMindMapStore.getState().addInkObject(g.item);
      }
    }
    contacts.current.delete(e.pointerId);
    gesture.current = null;
    setLive(null);
    setPreviews([]);
    setLassoPath([]);
    setJoinPreview(null);
    if (eraser.current) eraser.current.style.display = "none";
    setHidden(new Set());
    useMindMapStore.setState({ inkGestureActive: false });
    if (g?.kind === "lasso" && useMindMapStore.getState().selectedInkIds.length)
      useMindMapStore.getState().setInkTool("select");
    if (contacts.current.size) startCamera();
    else {
      camera.current = null;
      useMindMapStore.getState().updateViewport(flow.getViewport());
    }
  };
  useEffect(() => {
    const el = surface.current;
    if (!active || !el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (contacts.current.size) return;
      const v = flow.getViewport(),
        rect = el.getBoundingClientRect(),
        zoom = Math.max(
          0.0001,
          Math.min(2.5, v.zoom * Math.exp(-event.deltaY * 0.002)),
        );
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      useMindMapStore.getState().noteCameraIntent();
      void flow
        .setViewport({
          x: x - ((x - v.x) * zoom) / v.zoom,
          y: y - ((y - v.y) * zoom) / v.zoom,
          zoom,
        })
        .then(() =>
          useMindMapStore.getState().updateViewport(flow.getViewport()),
        );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [active, flow]);

  return (
    <>
      <ViewportPortal>
        {bounds && (
          <svg
            data-ink-layer
            aria-label="손그림 잉크"
            width={bounds.width}
            height={bounds.height}
            viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
            style={{
              position: "absolute",
              left: bounds.x,
              top: bounds.y,
              pointerEvents: "none",
              overflow: "visible",
              zIndex: 20,
            }}
          >
            {items.map((stroke) => (
              <g
                key={stroke.id}
                style={{ opacity: hidden.has(stroke.id) ? 0 : 1 }}
              >
                <AnalogMark item={stroke} />
              </g>
            ))}
          </svg>
        )}
        <svg
          data-ink-preview
          width="1"
          height="1"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 21,
          }}
        >
          {live && <AnalogMark item={live} />}
          {previews.map((s) => (
            <AnalogMark key={s.id} item={s} />
          ))}
          {lassoPath.length > 1 && (
            <path
              data-ink-lasso
              d={
                lassoPath
                  .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                  .join(" ") + "Z"
              }
              fill="#ed5269"
              fillOpacity={0.06}
              stroke="#ed5269"
              strokeWidth={1.5 / flow.getZoom()}
              strokeDasharray={`${5 / flow.getZoom()} ${3 / flow.getZoom()}`}
            />
          )}
          {joinPreview && (
            <circle
              data-ink-junction
              cx={joinPreview.point.x}
              cy={joinPreview.point.y}
              r={6 / flow.getZoom()}
              fill="#fcf5e8"
              stroke="#246d56"
              strokeWidth={2 / flow.getZoom()}
            />
          )}
          {tool === "reshape" &&
            selected &&
            isStroke(selected) &&
            strokeEditHandles(
              live?.id === selected.id && isStroke(live) ? live : selected,
            ).map((h) => (
              <circle
                data-curve-handle={h.id}
                key={h.id}
                cx={h.point.x}
                cy={h.point.y}
                r={7 / flow.getZoom()}
                fill="#fffefb"
                stroke="#ed5269"
                strokeWidth={2 / flow.getZoom()}
              />
            ))}
          <circle
            ref={eraser}
            fill="none"
            stroke="#64748b"
            strokeWidth="1"
            style={{ display: "none" }}
          />
        </svg>
        {(tool === "select" || tool === "lasso") && selectedIds.length > 0 && (
          <svg
            data-studio-selection
            width="1"
            height="1"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              overflow: "visible",
              pointerEvents: "none",
              zIndex: 22,
            }}
          >
            {items
              .filter((s) => selectedIds.includes(s.id))
              .map((s) => {
                const b = itemBounds(previews.find((p) => p.id === s.id) ?? s);
                return (
                  <rect
                    key={s.id}
                    data-selected-ink={s.id}
                    {...b}
                    fill="none"
                    stroke="#ed5269"
                    strokeWidth={1.5 / flow.getZoom()}
                    strokeDasharray={`${5 / flow.getZoom()} ${3 / flow.getZoom()}`}
                  />
                );
              })}
          </svg>
        )}
      </ViewportPortal>
      {active && (
        <div
          ref={surface}
          data-ink-input
          data-tool={tool}
          role="region"
          aria-label={tool === "pan" ? "이동 영역" : "손그림 입력 영역"}
          className="nopan nowheel nodrag absolute inset-0 z-[9] touch-none"
          style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={reset}
          onPointerLeave={() => {
            if (!contacts.current.size) setJoinPreview(null);
          }}
          onLostPointerCapture={(e) => {
            if (contacts.current.has(e.pointerId)) reset();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </>
  );
}
