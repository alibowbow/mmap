"use client";

import { ViewportPortal, useReactFlow } from "@xyflow/react";
import {
  memo,
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
  strokeHit,
  strokePath,
  MAX_STROKE_POINTS,
} from "@/lib/ink";
import { createId } from "@/lib/id";
import { useMindMapStore } from "@/store/mindMapStore";
import type { InkPoint, InkStroke, MindMapViewport } from "@/types/mindmap";

const Stroke = memo(function Stroke({ stroke }: { stroke: InkStroke }) {
  return (
    <path
      data-ink-stroke={stroke.id}
      d={strokePath(stroke)}
      fill={stroke.color}
      fillRule="nonzero"
    />
  );
});
type Contact = { x: number; y: number; type: string };
type Gesture = {
  kind: "pen" | "eraser";
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
  const preview = useRef<SVGPathElement>(null);
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
    if (preview.current) preview.current.setAttribute("d", "");
    if (eraser.current) eraser.current.style.display = "none";
    setHidden(new Set());
    useMindMapStore.setState({ inkGestureActive: false });
  }, []);
  useEffect(() => {
    reset();
    // A cancelled gesture never adds partial ink or deletes committed strokes.
    const cancel = () => reset();
    window.addEventListener("blur", cancel);
    const visibility = () => {
      if (document.visibilityState === "hidden") reset();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
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
  const renderPreview = () => {
    frame.current = 0;
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pen" && preview.current) {
      // The in-flight path is drawn once per animation frame, outside Zustand.
      preview.current.setAttribute("d", strokePath({ ...g.stroke }));
      preview.current.setAttribute("fill", g.stroke.color);
    }
    if (g.kind === "eraser")
      setHidden((prev) =>
        prev.size === g.removed.size ? prev : new Set(g.removed),
      );
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(renderPreview);
  };
  const eraseSegment = (g: Gesture, point: InkPoint) => {
    for (const stroke of useMindMapStore.getState().ink.strokes) {
      if (
        !g.removed.has(stroke.id) &&
        strokeHit(stroke, g.last, point, 12 / g.zoom)
      )
        g.removed.add(stroke.id);
    }
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
      if (preview.current) preview.current.setAttribute("d", "");
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
    const kind = tool === "eraser" || e.button === 5 ? "eraser" : "pen";
    const g: Gesture = {
      kind,
      pointer: e.pointerId,
      doc: state.activeDocumentId,
      stroke: { id: createId("ink"), ...state.inkSettings, points: [point] },
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
    if (!contacts.current.has(e.pointerId)) return;
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
      if (g.kind === "pen") appendInkPoint(g.stroke.points, point, g.zoom);
      else eraseSegment(g, point);
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
        appendInkPoint(g.stroke.points, point, g.zoom, true);
        useMindMapStore.getState().addInkStroke(g.stroke);
        if (g.stroke.points.length === MAX_STROKE_POINTS)
          useMindMapStore
            .getState()
            .addToast("긴 획을 마쳤습니다. 다음 획으로 이어 그려주세요.");
      } else {
        eraseSegment(g, point);
        useMindMapStore.getState().eraseInkStrokes([...g.removed]);
      }
    }
    contacts.current.delete(e.pointerId);
    gesture.current = null;
    if (preview.current) preview.current.setAttribute("d", "");
    if (eraser.current) eraser.current.style.display = "none";
    setHidden(new Set());
    useMindMapStore.setState({ inkGestureActive: false });
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
            {ink.strokes.map((stroke) => (
              <g
                key={stroke.id}
                style={{ opacity: hidden.has(stroke.id) ? 0 : 1 }}
              >
                <Stroke stroke={stroke} />
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
          <path ref={preview} fillRule="nonzero" />
          <circle
            ref={eraser}
            fill="none"
            stroke="#64748b"
            strokeWidth="1"
            style={{ display: "none" }}
          />
        </svg>
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
          onLostPointerCapture={(e) => {
            if (contacts.current.has(e.pointerId)) reset();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </>
  );
}
